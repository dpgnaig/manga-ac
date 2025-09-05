import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import open from 'open';
import compression from 'compression';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(
    compression({
      filter: (req, res) => {
        // ❌ Don't compress images (prevents ERR_CONTENT_LENGTH_MISMATCH)
        if (/\.(jpe?g|png|gif|webp)$/i.test(req.url)) {
          return false;
        }
        return compression.filter(req, res);
      },
      threshold: 1024, // only compress responses > 1kb
    }),
  );

  const configService = app.get(ConfigService);

  app.enableCors({
    origin: true, // Allow all origins for testing
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Manga-Source', 'X-Requested-With', 'Cache-Control', 'Pragma', 'Expires'],
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('Truyện Ăn Cắp API')
    .setDescription('Bố mày đi ăn cắp ở trang khác đấy ý kiến cốn lài')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'apiKey',
        scheme: 'bearer',
        bearerFormat: 'JWT', // Optional, only for UI display
        name: 'Authorization',
        in: 'header',
        description: 'JWT Authorization header using the Bearer scheme.<br/>Example: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJiOWQ5YzU3My04YzVmLTQ1MDEtYmJiMi0wNGU3ZWUwNzAzMzAiLCJ1c2VyX2lkIjoxLCJ1c2VyX25hbWUiOiJsb25nLnBkQGV4dHJlbWV2bi5jb20udm4iLCJpc19yZWZyZXNoIjowLCJ0eXAiOiI5Iiwicm9sZV9pZCI6MiwiZXhwIjo4MDQwNDA3NDk2LCJpc3MiOiJodHRwczovL2Rldi5oY3MtYXBpLmNvbSIsImF1ZCI6Imh0dHBzOi8vZGV2Lmhjcy1hcGkuY29tIn0.LqSVaKOAy_82mE8jP-yUbzFU7Xt7NUY-5qOXzZ9bknU'
      },
      'access-token', // This name will be used in the @ApiBearerAuth() decorator
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('swagger', app, document); // Swagger UI at /api

  const port = configService.get<number>('PORT') || 3000;
  await app.listen(port);

  // await open(`http://localhost:${port}/swagger`);
}

bootstrap();
