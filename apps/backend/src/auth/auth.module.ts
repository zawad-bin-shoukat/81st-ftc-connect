import { RegistrationService } from './registration.service.js';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { SessionGuard } from './session.guard.js';
import { LocalOtpDelivery } from './local-otp.delivery.js';
import { SmsBdDelivery } from './sms-bd.delivery.js';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [
    RegistrationService,
    AuthService,
    SessionGuard,
    LocalOtpDelivery,
    SmsBdDelivery,
  ],
  exports: [SessionGuard, AuthService],
})
export class AuthModule {}
