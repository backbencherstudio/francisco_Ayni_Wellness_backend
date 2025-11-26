import { Injectable, Logger } from '@nestjs/common';
import { getStorage } from 'firebase-admin/storage';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';

interface FirebaseStorageConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  bucket: string;
}

@Injectable()
export class FirebaseStorageService {
  private readonly logger = new Logger(FirebaseStorageService.name);
  private app: App;
  private bucketName: string;

  constructor() {
    const cfg = this.loadConfig();
    this.bucketName = cfg.bucket;
    if (!getApps().length) {
      this.app = initializeApp({
        credential: cert({
          projectId: cfg.projectId,
          clientEmail: cfg.clientEmail,
          privateKey: cfg.privateKey,
        }),
        storageBucket: cfg.bucket,
      });
      this.logger.log(`Initialized Firebase app for bucket ${cfg.bucket}`);
    } else {
      this.app = getApps()[0];
    }
    // Attempt to validate bucket and fallback if necessary
    this.detectBucket(cfg.projectId, cfg.bucket)
      .then((resolved) => {
        if (resolved !== this.bucketName) {
          this.logger.warn(`Configured bucket '${this.bucketName}' not found; using detected bucket '${resolved}'.`);
          this.bucketName = resolved;
        }
      })
      .catch((err) => {
        this.logger.error(`Bucket detection failed: ${err.message}`);
      });
  }

  private async detectBucket(projectId: string, configured: string): Promise<string> {
    const storage = this.storage();
    const candidates: string[] = [];
    // Add configured first
    candidates.push(configured);
    // Common Firebase bucket patterns
    const appspot = `${projectId}.appspot.com`;
    const firebasestorage = `${projectId}.firebasestorage.app`;
    if (!candidates.includes(appspot)) candidates.push(appspot);
    if (!candidates.includes(firebasestorage)) candidates.push(firebasestorage);

    for (const name of candidates) {
      try {
        const [exists] = await storage.bucket(name).exists();
        if (exists) return name;
      } catch (e) {
        // Ignore and continue
      }
    }
    // If nothing validated, return the original (will surface runtime errors later)
    return configured;
  }

  private loadConfig(): FirebaseStorageConfig {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    const bucket = process.env.FIREBASE_STORAGE_BUCKET;
    if (!projectId || !clientEmail || !privateKey || !bucket) {
      throw new Error('Missing required Firebase env vars (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, FIREBASE_STORAGE_BUCKET)');
    }
    // Handle escaped newlines in env variable
    privateKey = privateKey.replace(/\\n/g, '\n');
    return { projectId, clientEmail, privateKey, bucket };
  }

  private storage() {
    return getStorage(this.app);
  }

  async listPrefix(prefix: string) {
    const bucket = this.storage().bucket(this.bucketName);
    const [files] = await bucket.getFiles({ prefix: prefix.endsWith('/') ? prefix : prefix + '/' });
    return files.map(f => ({
      name: f.name,
      size: f.metadata.size ? parseInt(String(f.metadata.size), 10) : 0,
      contentType: f.metadata.contentType,
      updated: f.metadata.updated,
      // Expose custom user metadata (e.g., duration_sec, duration_ms, duration_min) if provided at upload
      customMetadata: (f.metadata && (f.metadata as any).metadata) || undefined,
    }));
  }

  async listTopLevelFolders() {
    const bucket = this.storage().bucket(this.bucketName);
    // getFiles returns: [files, nextQuery, apiResponse]
    const [files, _next, apiResponse] = await (bucket as any).getFiles({ delimiter: '/' });
    const folderSet = new Set<string>();
    // Prefer apiResponse.prefixes when available (authoritative list of "folders")
    if (apiResponse && Array.isArray(apiResponse.prefixes)) {
      apiResponse.prefixes.forEach((p: string) => folderSet.add(p));
    }
    // Fallback: derive from file names (in case apiResponse lacks prefixes due to empty root or SDK change)
    if (folderSet.size === 0) {
      files.forEach((f: any) => {
        const parts = f.name.split('/');
        if (parts.length > 1) folderSet.add(parts[0] + '/');
      });
    }
    return Array.from(folderSet).sort();
  }

  async getFileSignedUrl(path: string, expiresInSeconds = 3600) {
    const bucket = this.storage().bucket(this.bucketName);
    // Try the provided path, and a trimmed-leading-slash variant if needed
    let file = bucket.file(path);
    let exists = false;
    // We'll capture any exists-check error to inform fallback behavior
    let existsCheckError: any = null;
    try {
      const resp = await file.exists();
      exists = Array.isArray(resp) ? resp[0] : !!resp;
    } catch (e) {
      existsCheckError = e;
      this.logger.warn(`getFileSignedUrl.exists check failed for path=${path}: ${e?.message || e}`);
      exists = false;
    }

    // Try alternate trimmed path if object wasn't found
    if (!exists) {
      const altPath = path.startsWith('/') ? path.slice(1) : path.replace(/^\.\//, '');
      if (altPath !== path) {
        try {
          const altFile = bucket.file(altPath);
          const resp2 = await altFile.exists();
          const altExists = Array.isArray(resp2) ? resp2[0] : !!resp2;
          if (altExists) {
            file = altFile;
            path = altPath;
            exists = true;
          }
        } catch (e) {
          // If this also errors, capture for diagnostics but continue to attempts below
          this.logger.warn(`getFileSignedUrl.altPath.exists check failed for altPath=${altPath}: ${e?.message || e}`);
          if (!existsCheckError) existsCheckError = e;
        }
      }
    }

    // If exists check explicitly failed due to billing/permission, try to generate a signed URL
    // or at least return a public fallback so clients can still attempt to fetch the object.
    // This helps local dev or cases where the API cannot complete the 'exists' call.
    try {
      const [signedUrl] = await file.getSignedUrl({ action: 'read', expires: Date.now() + expiresInSeconds * 1000 });
      return { url: signedUrl, source: 'signed' };
    } catch (signedErr) {
      this.logger.warn(`getFileSignedUrl.signedUrl failed for path=${path}: ${signedErr?.message || signedErr}`);
      // Construct public fallback (may be inaccessible if object is private)
      const publicUrl = `https://storage.googleapis.com/${this.bucketName}/${encodeURI(path)}`;
      const result: any = { url: publicUrl, source: 'public-fallback' };
      // Attach diagnostic info if available
      if (existsCheckError) result.exists_check_error = String(existsCheckError?.message || existsCheckError);
      result.signed_url_error = String(signedErr?.message || signedErr);
      return result;
    }
  }
}
