import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  if (process.env.NODE_ENV === 'development') {
    app.enableCors({
      origin: 'http://localhost:8080',
      allowedHeaders: ['Content-Type', 'Authorization'],
    });
  }
  await app.listen(process.env.PORT ?? 3000, '127.0.0.1');
}
await bootstrap();
