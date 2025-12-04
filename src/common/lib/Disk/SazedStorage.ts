import { StorageClass } from './StorageClass';
import { LocalAdapter } from './drivers/LocalAdapter';
import { DiskOption, DiskType } from './Option';
import { S3Adapter } from './drivers/S3Adapter';
import { IStorage } from './drivers/iStorage';

/**
 * SazedStorage for handling storage (local storage, aws s3 storage)
 * @class SazedStorage
 * @author Sazedul Islam <sazedulislam9126@gmail.com>
 */
export class SazedStorage {
  private static _config: DiskOption;

  /**
   * Storage configuration
   * @param config
   */
  public static config(config: DiskOption) {
    this._config = config;
  }

  /**
   * Returns configuration
   * @returns {DiskOption}
   */
  public static getConfig(): DiskOption {
    return this._config;
  }

  /**
   * Specify disk name
   * @param disk
   * @returns
   */
  public static disk(disk: DiskType): StorageClass {
    if (!this._config) {
      const path = require('path');
      this._config = ({
        driver: 'local',
        connection: { rootUrl: path.join(process.cwd(), 'public', 'storage'), publicUrl: '/storage' },
      } as unknown) as DiskOption;
    }
    this._config.driver = disk;
    return this.storageDisk();
  }
  /**
   * store data
   * @param key
   * @param value
   * @returns
   */
  public static async put(key: string, value: any): Promise<any> {
    const disk = this.storageDisk();
    return await disk.put(key, value);
  }

  /**
   * get data url
   * @param key
   * @returns
   */
  public static url(key: string): string {
    const disk = this.storageDisk();
    return disk.url(key);
  }

  public static async isExists(key: string): Promise<boolean> {
    const disk = this.storageDisk();
    return await disk.isExists(key);
  }

  /**
   * read data
   * @param key
   * @returns
   */
  public static async get(key: string): Promise<any> {
    const disk = this.storageDisk();
    return await disk.get(key);
  }

  /**
   * delete data
   * @param key
   * @returns
   */
  public static async delete(key: string): Promise<any> {
    const disk = this.storageDisk();
    if (await disk.isExists(key)) {
      return await disk.delete(key);
    }
    return false;
  }

  /**
   * process storage disk type
   * @returns
   */
  private static storageDisk() {
    // defensive guard: if config missing, fallback to local storage
    if (!this._config) {
      const path = require('path');
      this._config = ({
        driver: 'local',
        connection: { rootUrl: path.join(process.cwd(), 'public', 'storage'), publicUrl: '/storage' },
      } as unknown) as DiskOption;
      console.warn('SazedStorage: no storage config found, falling back to local ./public/storage');
    }

    const driver: string = this._config.driver;
    const config: DiskOption = this._config;

    // helpful debug logging to show which driver/endpoint will be used
    try {
      const cfgLog: any = {
        driver: driver,
      };
      if (driver === 's3' && config.connection) {
        cfgLog.endpoint = (config.connection as any).awsEndpoint || null;
        cfgLog.bucket = (config.connection as any).awsBucket || null;
        cfgLog.minio = !!(config.connection as any).minio;
      } else if (driver === 'local' && config.connection) {
        cfgLog.rootUrl = config.connection.rootUrl;
        cfgLog.publicUrl = config.connection.publicUrl;
      }
      // do not spam logs in production; this is a short informative log at startup
      console.log('SazedStorage config:', cfgLog);
    } catch (err) {
      // ignore logging errors
    }

    let driverAdapter: IStorage;
    switch (driver) {
      case 's3':
        driverAdapter = new S3Adapter(config);
        break;
      case 'local':
      default:
        driverAdapter = new LocalAdapter(config);
        break;
    }

    return new StorageClass(driverAdapter);
  }
}
