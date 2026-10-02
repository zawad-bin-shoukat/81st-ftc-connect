import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  if (process.env.NODE_ENV === 'production') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }
  if (process.env.NODE_ENV === 'development') {
    app.enableCors({
      origin: 'http://localhost:8080',
      allowedHeaders: ['Content-Type', 'Authorization'],
    });
  }
  await app.listen(
    process.env.PORT ?? 3000,
    process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1',
  );
}
await bootstrap();
