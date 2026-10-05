import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { MemberRequest } from '../auth/session.guard.js';
import { PhotoStorageService } from './photo-storage.service.js';

@Injectable()
export class MemberPhotoService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(PhotoStorageService) private readonly storage: PhotoStorageService,
  ) {}

  async replaceOwn(auth: MemberRequest['auth'], bytes: Buffer) {
    const prepared = await this.storage.prepare(bytes);
    if (auth.testAccountId)
      return this.replaceTest(auth.testAccountId, prepared);
    const id = auth.memberId!;
    const member = await this.db.member.findFirst({
      where: { id, isActive: true },
      select: { profilePhotoKey: true },
    });
    if (!member) throw new NotFoundException('Member not found.');
    const newKey = await this.storage.upload(id, prepared);
    try {
      const updated = await this.db.member.updateMany({
        where: { id, isActive: true, profilePhotoKey: member.profilePhotoKey },
        data: { profilePhotoKey: newKey },
      });
      if (updated.count !== 1)
        throw new ConflictException('Photo changed. Please retry.');
    } catch (error) {
      await this.storage.remove(newKey).catch(() => {});
      throw error;
    }
    if (member.profilePhotoKey)
      await this.storage.remove(member.profilePhotoKey);
    return { photoUrl: await this.storage.readUrl(newKey, 'full') };
  }

  private async replaceTest(
    id: string,
    prepared: { full: Buffer; thumb: Buffer },
  ) {
    const account = await this.db.testAccount.findUniqueOrThrow({
      where: { id },
    });
    const profile = account.profile as Record<string, unknown>;
    const oldKey =
      typeof profile.profilePhotoKey === 'string'
        ? profile.profilePhotoKey
        : null;
    const newKey = await this.storage.upload(`test-${id}`, prepared);
    try {
      await this.db.testAccount.update({
        where: { id },
        data: {
          profile: {
            ...profile,
            profilePhotoKey: newKey,
          } as Prisma.InputJsonObject,
        },
      });
    } catch (error) {
      await this.storage.remove(newKey).catch(() => {});
      throw error;
    }
    if (oldKey) await this.storage.remove(oldKey);
    return { photoUrl: await this.storage.readUrl(newKey, 'full') };
  }

  async removeOwn(auth: MemberRequest['auth']) {
    if (auth.testAccountId) {
      const account = await this.db.testAccount.findUniqueOrThrow({
        where: { id: auth.testAccountId },
      });
      const profile = account.profile as Record<string, unknown>;
      const oldKey =
        typeof profile.profilePhotoKey === 'string'
          ? profile.profilePhotoKey
          : null;
      if (oldKey) await this.storage.remove(oldKey);
      delete profile.profilePhotoKey;
      await this.db.testAccount.update({
        where: { id: auth.testAccountId },
        data: { profile: profile as Prisma.InputJsonObject },
      });
      return { photoUrl: null };
    }
    const member = await this.db.member.findFirst({
      where: { id: auth.memberId!, isActive: true },
      select: { profilePhotoKey: true },
    });
    if (!member) throw new NotFoundException('Member not found.');
    if (member.profilePhotoKey)
      await this.storage.remove(member.profilePhotoKey);
    const updated = await this.db.member.updateMany({
      where: {
        id: auth.memberId!,
        isActive: true,
        profilePhotoKey: member.profilePhotoKey,
      },
      data: { profilePhotoKey: null },
    });
    if (updated.count !== 1)
      throw new ConflictException('Photo changed. Please retry.');
    return { photoUrl: null };
  }
}
