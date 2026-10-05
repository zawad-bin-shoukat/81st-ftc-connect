import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

const maxUploadBytes = 8 * 1024 * 1024;
const maxInputPixels = 40_000_000;
const allowedFormats = new Set(['jpeg', 'png', 'webp', 'heif']);

@Injectable()
export class PhotoStorageService {
  private readonly client: S3Client | null;
  private readonly bucket: string | null;

  constructor() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucket = process.env.R2_BUCKET;
    const credentials = [accountId, accessKeyId, secretAccessKey].filter(
      Boolean,
    );
    if (credentials.length !== 0 && (credentials.length !== 3 || !bucket))
      throw new Error('Incomplete R2 photo storage configuration.');
    this.bucket = credentials.length === 3 ? bucket! : null;
    this.client =
      credentials.length === 3
        ? new S3Client({
            region: 'auto',
            endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
            credentials: {
              accessKeyId: accessKeyId!,
              secretAccessKey: secretAccessKey!,
            },
          })
        : null;
  }

  private configured() {
    if (!this.client || !this.bucket)
      throw new ServiceUnavailableException(
        'Profile photos are not configured yet.',
      );
    return { client: this.client, bucket: this.bucket };
  }

  async readUrl(key: string, size: 'full' | 'thumb') {
    const { client, bucket } = this.configured();
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: `${key}/${size}.jpg` }),
      {
        expiresIn: 300,
      },
    );
  }

  async prepare(bytes: Buffer) {
    if (!bytes.length || bytes.length > maxUploadBytes)
      throw new BadRequestException('Choose a photo smaller than 8 MB.');
    try {
      const image = sharp(bytes, {
        limitInputPixels: maxInputPixels,
        failOn: 'error',
      });
      const metadata = await image.metadata();
      if (!metadata.format || !allowedFormats.has(metadata.format))
        throw new Error('Unsupported image format');
      const full = await sharp(bytes, {
        limitInputPixels: maxInputPixels,
        failOn: 'error',
      })
        .rotate()
        .resize({
          width: 1280,
          height: 1280,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
      const thumb = await sharp(bytes, {
        limitInputPixels: maxInputPixels,
        failOn: 'error',
      })
        .rotate()
        .resize({
          width: 320,
          height: 320,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 78, mozjpeg: true })
        .toBuffer();
      return { full, thumb };
    } catch {
      throw new BadRequestException(
        'Choose a valid JPEG, PNG, WebP, or HEIC photo.',
      );
    }
  }

  async upload(ownerId: string, prepared: { full: Buffer; thumb: Buffer }) {
    const key = `profiles/${ownerId}/${randomUUID()}`;
    await this.putPrepared(key, prepared);
    return key;
  }

  // Also used by the roster importer, whose source-hash key makes retries safe.
  async putPrepared(key: string, prepared: { full: Buffer; thumb: Buffer }) {
    const { client, bucket } = this.configured();
    try {
      for (const size of ['full', 'thumb'] as const) {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: `${key}/${size}.jpg`,
            Body: prepared[size],
            ContentType: 'image/jpeg',
            CacheControl: 'private, max-age=300',
          }),
        );
      }
    } catch (error) {
      await this.remove(key).catch(() => {});
      throw error;
    }
  }

  async remove(key: string) {
    const { client, bucket } = this.configured();
    for (const size of ['full', 'thumb'] as const) {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: `${key}/${size}.jpg` }),
      );
    }
  }
}
