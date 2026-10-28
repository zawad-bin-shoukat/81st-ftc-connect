import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { MembersService } from './members.service.js';
import type { PrismaService } from '../database/prisma.service.js';
import type { PhotoStorageService } from './photo-storage.service.js';

const memberId = '00000000-0000-4000-8000-000000000001';

function setup() {
  const member = {
    update: vi.fn().mockResolvedValue({}),
    findFirst: vi.fn().mockResolvedValue({
      id: memberId,
      name: 'Example Member',
      profilePhotoKey: null,
    }),
  };
  const service = new MembersService(
    { member } as unknown as PrismaService,
    {} as PhotoStorageService,
  );
  return { member, service };
}

describe('real member profile edits', () => {
  it.each([
    ['name', 'Changed Name'],
    ['homeDistrict', 'Dhaka'],
    ['bloodGroup', 'A+'],
    ['bcsBatch', 43],
    ['bcsBatch', null],
  ])('rejects changes to %s', async (field, value) => {
    const { member, service } = setup();
    await expect(
      service.updateOwn(memberId, { [field]: value }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(member.update).not.toHaveBeenCalled();
  });

  it('still allows contact and personal text changes', async () => {
    const { member, service } = setup();
    await service.updateOwn(memberId, {
      email: 'member@example.com',
      aboutMe: 'Updated biography',
    });
    expect(member.update).toHaveBeenCalledWith({
      where: { id: memberId, isActive: true },
      data: { email: 'member@example.com', aboutMe: 'Updated biography' },
    });
  });
});
