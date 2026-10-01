import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { MembersModule } from './members/members.module.js';

@Module({
  imports: [MembersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
