import * as AWS from 'aws-sdk';
import { IStorage } from './iStorage';
import { DiskOption } from '../Option';

/**
 * S3Adapter for s3 bucket storage
 */
export class S3Adapter implements IStorage {
  private _config: DiskOption;
  private s3: AWS.S3;

  constructor(config: DiskOption) {
    this._config = config;
    const awsConfig: AWS.S3.ClientConfiguration = {
      endpoint: this._config.connection.awsEndpoint,
      region: this._config.connection.awsDefaultRegion,
      credentials: {
        accessKeyId: this._config.connection.awsAccessKeyId,
        secretAccessKey: this._config.connection.awsSecretAccessKey,
      },
    };
    if (this._config.connection.minio) {
      // s3ForcePathStyle: true, // Required for MinIO
      awsConfig['s3ForcePathStyle'] = true;
    }
    this.s3 = new AWS.S3({
      ...awsConfig,
    });
  }

  /**
   * returns object url
   *
   * https://[bucketname].s3.[region].amazonaws.com/[object]
   * and for minio
   * http://[endpoint]/[bucketname]/[object]
   * @param key
   * @returns
   */

  url(key: string): string {
    if (this._config.connection.minio) {
      return `${this._config.connection.awsEndpoint}/${this._config.connection.awsBucket}/${key}`;
    }
    return `https://${this._config.connection.awsBucket}.s3.${this._config.connection.awsDefaultRegion}.amazonaws.com/${key}`;
  }

  /**
   * check if file exists
   * @param key
   * @returns
   */
  async isExists(key: string): Promise<boolean> {
    try {
      const params = { Bucket: this._config.connection.awsBucket, Key: key };
      await this.s3.headObject(params).promise();
      return true;
    } catch (error) {
      if ((error as AWS.AWSError).code === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * get data
   * @param key
   */
  async get(key: string) {
    try {
      const params = { Bucket: this._config.connection.awsBucket, Key: key };
      const data = this.s3.getObject(params).createReadStream();
      return data;
    } catch (error) {
      throw new Error(`Failed to get object ${key}: ${error}`);
    }
  }

  /**
   * put data
   * @param key
   * @param value
   */
  async put(
    key: string,
    value: Buffer | Uint8Array | string,
  ): Promise<AWS.S3.ManagedUpload.SendData> {
    try {
      // Detect ContentType based on file extension
      const contentType = this.getContentType(key);
      
      const params: AWS.S3.PutObjectRequest = {
        Bucket: this._config.connection.awsBucket,
        Key: key,
        Body: value,
      };

      // Set ContentType if detected
      if (contentType) {
        params.ContentType = contentType;
      }

      const upload = await this.s3.upload(params).promise();
      return upload;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get ContentType based on file extension
   * @param key
   * @returns
   */
  private getContentType(key: string): string | undefined {
    const ext = key.toLowerCase().split('.').pop();
    const contentTypes: { [key: string]: string } = {
      // Images
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      ico: 'image/x-icon',
      bmp: 'image/bmp',
      // Videos
      mp4: 'video/mp4',
      webm: 'video/webm',
      ogv: 'video/ogg',
      // Documents
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // Text
      txt: 'text/plain',
      html: 'text/html',
      css: 'text/css',
      js: 'application/javascript',
      json: 'application/json',
    };
    return contentTypes[ext || ''] || undefined;
  }

  /**
   * delete data
   * @param key
   */
  async delete(key: string): Promise<boolean> {
    try {
      const params = { Bucket: this._config.connection.awsBucket, Key: key };
      await this.s3.deleteObject(params).promise();
      return true;
    } catch (error) {
      if ((error as AWS.AWSError).code === 'NotFound') {
        return false;
      }
      throw error;
    }
  }
}
