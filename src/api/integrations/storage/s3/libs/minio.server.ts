import { ConfigService, S3 } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { BadRequestException } from '@exceptions';
import * as MinIo from 'minio';
import { join } from 'path';
import { Readable, Transform } from 'stream';

const logger = new Logger('S3 Service');

const BUCKET = new ConfigService().get<S3>('S3');

interface Metadata extends MinIo.ItemBucketMetadata {
  'Content-Type': string;
}

const objectPath = (folder: string, fileName: string) => join(folder, fileName);

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const minioClient = (() => {
  if (BUCKET?.ENABLE) {
    return new MinIo.Client({
      endPoint: BUCKET.ENDPOINT,
      port: BUCKET.PORT,
      useSSL: BUCKET.USE_SSL,
      accessKey: BUCKET.ACCESS_KEY,
      secretKey: BUCKET.SECRET_KEY,
      region: BUCKET.REGION,
    });
  }
})();

const bucketName = BUCKET.BUCKET_NAME;

const bucketExists = async () => {
  if (minioClient) {
    try {
      const list = await minioClient.listBuckets();
      return list.find((bucket) => bucket.name === bucketName);
    } catch {
      return false;
    }
  }
};

const setBucketPolicy = async () => {
  if (minioClient) {
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: '*',
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${bucketName}/*`],
        },
      ],
    };
    await minioClient.setBucketPolicy(bucketName, JSON.stringify(policy));
  }
};

const createBucket = async () => {
  if (minioClient) {
    try {
      const exists = await bucketExists();
      if (!exists) {
        await minioClient.makeBucket(bucketName);
      }
      if (!BUCKET.SKIP_POLICY) {
        await setBucketPolicy();
      }
      logger.info(`S3 Bucket ${bucketName} - ON`);
      return true;
    } catch (error) {
      logger.error('S3 ERROR:');
      logger.error(error);
      return false;
    }
  }
};

createBucket();

const uploadFile = async (fileName: string, file: Buffer | Transform | Readable, size: number, metadata: Metadata) => {
  if (minioClient) {
    const objectName = objectPath('evolution-api', fileName);
    try {
      metadata['custom-header-application'] = 'evolution-api';
      const uploadResult = await minioClient.putObject(bucketName, objectName, file, size, metadata);
      const objectStat = await minioClient.statObject(bucketName, objectName);
      const expectedSize = Number(size);

      if (Number.isFinite(expectedSize) && expectedSize > 0 && objectStat.size !== expectedSize) {
        throw new Error(
          `S3 upload verification failed for ${objectName}: expected ${expectedSize} bytes, got ${objectStat.size} bytes`,
        );
      }

      logger.info(`S3 upload verified: ${bucketName}/${objectName} (${objectStat.size} bytes)`);
      return { ...uploadResult, objectName, objectStat, verified: true };
    } catch (error) {
      logger.error(error);
      throw new Error(`S3 upload failed for ${objectName}: ${getErrorMessage(error)}`);
    }
  }

  throw new Error('S3 upload failed: client is not configured');
};

const getObjectUrl = async (fileName: string, expiry?: number) => {
  if (minioClient) {
    try {
      const objectName = objectPath('evolution-api', fileName);
      if (expiry) {
        return await minioClient.presignedGetObject(bucketName, objectName, expiry);
      }
      return await minioClient.presignedGetObject(bucketName, objectName);
    } catch (error) {
      throw new BadRequestException(error?.message);
    }
  }
};

const uploadTempFile = async (
  folder: string,
  fileName: string,
  file: Buffer | Transform | Readable,
  size: number,
  metadata: Metadata,
) => {
  if (minioClient) {
    const objectName = objectPath(folder, fileName);
    try {
      metadata['custom-header-application'] = 'evolution-api';
      const uploadResult = await minioClient.putObject(bucketName, objectName, file, size, metadata);
      const objectStat = await minioClient.statObject(bucketName, objectName);
      const expectedSize = Number(size);

      if (Number.isFinite(expectedSize) && expectedSize > 0 && objectStat.size !== expectedSize) {
        throw new Error(
          `S3 temp upload verification failed for ${objectName}: expected ${expectedSize} bytes, got ${objectStat.size} bytes`,
        );
      }

      logger.info(`S3 temp upload verified: ${bucketName}/${objectName} (${objectStat.size} bytes)`);
      return { ...uploadResult, objectName, objectStat, verified: true };
    } catch (error) {
      logger.error(error);
      throw new Error(`S3 temp upload failed for ${objectName}: ${getErrorMessage(error)}`);
    }
  }

  throw new Error('S3 temp upload failed: client is not configured');
};

const deleteFile = async (folder: string, fileName: string) => {
  if (minioClient) {
    const objectName = objectPath(folder, fileName);
    try {
      return await minioClient.removeObject(bucketName, objectName);
    } catch (error) {
      logger.error(error);
      return error;
    }
  }
};

export { BUCKET, deleteFile, getObjectUrl, uploadFile, uploadTempFile };
