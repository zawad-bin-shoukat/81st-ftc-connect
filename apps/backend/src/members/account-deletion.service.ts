import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { PhotoStorageService } from './photo-storage.service.js';
import type { MemberRequest } from '../auth/session.guard.js';

@Injectable()
export class AccountDeletionService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(PhotoStorageService) private readonly photos: PhotoStorageService,
  ) {}

  async deleteOwn(auth: MemberRequest['auth']) {
    await this.db.$transaction(
      async (tx) => {
        if (auth.testAccountId) {
          await tx.$queryRawUnsafe(
            'SELECT id FROM test_accounts WHERE id=$1::uuid FOR UPDATE',
            auth.testAccountId,
          );
          const test = await tx.testAccount.findUniqueOrThrow({
            where: { id: auth.testAccountId },
          });
          const photoKey = (test.profile as Record<string, unknown>)
            .profilePhotoKey;
          if (typeof photoKey === 'string') await this.photos.remove(photoKey);
          await tx.registrationRequest.updateMany({
            where: { reviewedByTestAccountId: auth.testAccountId },
            data: { reviewedByTestAccountId: null },
          });
          await tx.testAccount.delete({ where: { id: auth.testAccountId } });
          return;
        }

        const memberId = auth.memberId!;
        await tx.$queryRawUnsafe(
          'SELECT id FROM members WHERE id=$1::uuid FOR UPDATE',
          memberId,
        );
        const member = await tx.member.findUniqueOrThrow({
          where: { id: memberId },
          select: { ftcId: true, profilePhotoKey: true },
        });
        if (member.profilePhotoKey)
          await this.photos.remove(member.profilePhotoKey);
        // A reviewed request must not keep the deleting reviewer's identity.
        await tx.registrationRequest.updateMany({
          where: { reviewedByMemberId: memberId },
          data: { reviewedByMemberId: null },
        });
        // An approved applicant's original submission also contains their data.
        await tx.registrationRequest.deleteMany({
          where: { ftcId: member.ftcId, phone: auth.loginPhone },
        });
        // Sessions disappear with the account; invitations and OTPs disappear
        // with the member through their database cascade relations.
        await tx.account.deleteMany({ where: { memberId } });
        await tx.member.delete({ where: { id: memberId } });
      },
      { timeout: 20000 },
    );
  }
}
