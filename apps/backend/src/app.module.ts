import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrivacyController } from './privacy.controller.js';
import { MembersModule } from './members/members.module.js';

@Module({
  imports: [MembersModule],
  controllers: [AppController, PrivacyController],
  providers: [AppService],
})
export class AppModule {}
