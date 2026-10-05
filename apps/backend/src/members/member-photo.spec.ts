import { describe, expect, it, vi } from 'vitest';
import { MemberPhotoService } from './member-photo.service.js';
import type { PrismaService } from '../database/prisma.service.js';
import type { PhotoStorageService } from './photo-storage.service.js';

const memberId = '00000000-0000-4000-8000-000000000001';
const auth = {
  memberId,
  testAccountId: null,
  tokenHash: 'test',
  loginPhone: 'test',
};

function setup(oldKey: string | null, updatedCount = 1) {
  const db = {
    member: {
      findFirst: vi.fn().mockResolvedValue({ profilePhotoKey: oldKey }),
      updateMany: vi.fn().mockResolvedValue({ count: updatedCount }),
    },
  };
  const storage = {
    prepare: vi
      .fn()
      .mockResolvedValue({
        full: Buffer.from('full'),
        thumb: Buffer.from('thumb'),
      }),
    upload: vi.fn().mockResolvedValue('profiles/new'),
    remove: vi.fn().mockResolvedValue(undefined),
    readUrl: vi.fn().mockResolvedValue('https://example.invalid/private-photo'),
  };
  return {
    db,
    storage,
    service: new MemberPhotoService(
      db as unknown as PrismaService,
      storage as unknown as PhotoStorageService,
    ),
  };
}

describe('own profile photo changes', () => {
  it('replaces only the authenticated member photo and removes the previous object', async () => {
    const { db, storage, service } = setup('profiles/old');
    const result = await service.replaceOwn(
      auth,
      Buffer.from('synthetic image'),
    );
    expect(db.member.updateMany).toHaveBeenCalledWith({
      where: { id: memberId, isActive: true, profilePhotoKey: 'profiles/old' },
      data: { profilePhotoKey: 'profiles/new' },
    });
    expect(storage.remove).toHaveBeenCalledWith('profiles/old');
    expect(result.photoUrl).toContain('private-photo');
  });

  it('cleans up a new object when another update wins the race', async () => {
    const { storage, service } = setup('profiles/old', 0);
    await expect(
      service.replaceOwn(auth, Buffer.from('synthetic image')),
    ).rejects.toThrow('Photo changed');
    expect(storage.remove).toHaveBeenCalledWith('profiles/new');
    expect(storage.remove).not.toHaveBeenCalledWith('profiles/old');
  });
});
