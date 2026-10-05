import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MemberPhotoService } from './member-photo.service.js';
import { PhotoStorageService } from './photo-storage.service.js';
import { TestAccountService } from '../auth/test-account.service.js';
import { AdminAccess } from '../auth/admin-access.js';
import { authConfig } from '../auth/auth-input.js';
import { SessionGuard } from '../auth/session.guard.js';
import type { MemberRequest } from '../auth/session.guard.js';
import { MembersService } from './members.service.js';
import { AccountDeletionService } from './account-deletion.service.js';

@Controller('me')
@UseGuards(SessionGuard)
export class MeController {
  constructor(
    @Inject(MembersService) private readonly members: MembersService,
    @Inject(AdminAccess) private readonly adminAccess: AdminAccess,
    @Inject(TestAccountService)
    private readonly testAccounts: TestAccountService,
    @Inject(AccountDeletionService)
    private readonly deletion: AccountDeletionService,
    @Inject(MemberPhotoService) private readonly photos: MemberPhotoService,
    @Inject(PhotoStorageService)
    private readonly photoStorage: PhotoStorageService,
  ) {}
  private async testProfile(id: string) {
    const { profilePhotoKey, ...profile } = (await this.testAccounts.profile(
      id,
    )) as Record<string, unknown>;
    return {
      ...profile,
      photoUrl:
        typeof profilePhotoKey === 'string'
          ? await this.photoStorage.readUrl(profilePhotoKey, 'full')
          : null,
    };
  }

  @Get()
  async me(@Req() request: MemberRequest) {
    if (request.auth.testAccountId)
      return this.testProfile(request.auth.testAccountId);
    return {
      ...(await this.members.detail(request.auth.memberId!)),
      loginPhone: request.auth.loginPhone,
      authenticationMode: authConfig().mode,
      isAdministrator: await this.adminAccess.allowed(request.auth.memberId!),
    };
  }
  @Patch()
  async update(@Req() request: MemberRequest, @Body() body: unknown) {
    if (request.auth.testAccountId) {
      await this.testAccounts.updateOwn(request.auth.testAccountId, body);
      return this.testProfile(request.auth.testAccountId);
    }
    return this.members.updateOwn(request.auth.memberId!, body);
  }

  @Post('photo')
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: { fileSize: 8 * 1024 * 1024, files: 1 },
    }),
  )
  uploadPhoto(
    @Req() request: MemberRequest,
    @UploadedFile() file?: { buffer: Buffer },
  ) {
    if (!file?.buffer) throw new BadRequestException('Choose a photo.');
    return this.photos.replaceOwn(request.auth, file.buffer);
  }

  @Delete('photo')
  removePhoto(@Req() request: MemberRequest) {
    return this.photos.removeOwn(request.auth);
  }

  @Delete()
  async deleteAccount(@Req() request: MemberRequest, @Body() body: unknown) {
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      (body as Record<string, unknown>).confirm !== 'DELETE'
    )
      throw new BadRequestException('Confirm account deletion.');
    await this.deletion.deleteOwn(request.auth);
    return { message: 'Your account and app profile have been deleted.' };
  }
}
