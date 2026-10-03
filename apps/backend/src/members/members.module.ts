import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { DirectoryAccessGuard } from './directory-access.guard.js';
import { MeController } from './me.controller.js';
import { LocalApiGuard } from './local-api.guard.js';
import { MembersController } from './members.controller.js';
import { MembersService } from './members.service.js';
import { AccountDeletionService } from './account-deletion.service.js';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [MembersController, MeController],
  providers: [
    MembersService,
    AccountDeletionService,
    LocalApiGuard,
    DirectoryAccessGuard,
  ],
})
export class MembersModule {}
