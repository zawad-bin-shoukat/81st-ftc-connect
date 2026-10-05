import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { PhotoStorageService } from './photo-storage.service.js';

describe('profile photo processing', () => {
  it('makes small JPEG copies without source metadata', async () => {
    const source = await sharp({
      create: { width: 2000, height: 1400, channels: 3, background: '#77aa99' },
    })
      .withMetadata({ orientation: 1 })
      .jpeg()
      .toBuffer();
    const prepared = await new PhotoStorageService().prepare(source);
    const full = await sharp(prepared.full).metadata();
    const thumb = await sharp(prepared.thumb).metadata();
    expect(full.format).toBe('jpeg');
    expect(full.width).toBeLessThanOrEqual(1280);
    expect(full.height).toBeLessThanOrEqual(1280);
    expect(thumb.width).toBeLessThanOrEqual(320);
    expect(thumb.height).toBeLessThanOrEqual(320);
    expect(full.exif).toBeUndefined();
    expect(thumb.exif).toBeUndefined();
  });

  it('signs a short-lived private read URL without contacting R2', async () => {
    const previous = {
      R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
      R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
      R2_BUCKET: process.env.R2_BUCKET,
    };
    try {
      process.env.R2_ACCOUNT_ID = 'a'.repeat(32);
      process.env.R2_ACCESS_KEY_ID = 'test-access';
      process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
      process.env.R2_BUCKET = 'ftc-connect-profile-photos';
      const url = await new PhotoStorageService().readUrl(
        'profiles/test/example',
        'thumb',
      );
      expect(url).toContain('ftc-connect-profile-photos');
      expect(url).toContain('thumb.jpg');
      expect(url).toContain('X-Amz-Expires=300');
      expect(url).not.toContain('test-secret');
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('rejects an unreadable upload', async () => {
    await expect(
      new PhotoStorageService().prepare(Buffer.from('not an image')),
    ).rejects.toThrow('Choose a valid');
  });
});
