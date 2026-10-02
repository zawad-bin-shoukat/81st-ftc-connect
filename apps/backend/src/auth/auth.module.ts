import { RegistrationService } from './registration.service.js';
import { AdminAccess, AdminGuard } from './admin-access.js';
import { AdminController } from './admin.controller.js';
import { TestAccountService } from './test-account.service.js';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { SessionGuard } from './session.guard.js';
import { LocalOtpDelivery } from './local-otp.delivery.js';
import { SmsBdDelivery } from './sms-bd.delivery.js';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController, AdminController],
  providers: [
    RegistrationService,
    TestAccountService,
    AdminAccess,
    AdminGuard,
    AuthService,
    SessionGuard,
    LocalOtpDelivery,
    SmsBdDelivery,
  ],
  exports: [SessionGuard, AuthService, AdminAccess, TestAccountService],
})
export class AuthModule {}
