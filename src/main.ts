import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import open from 'open';

async function bootstrap() {
  // const httpsOptions = {
  //   key: fs.readFileSync('server.key'),
  //   cert: fs.readFileSync('server.cert'),
  // };


  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: true, // Allow all origins for testing
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Manga-Source', 'X-Requested-With'],
    credentials: true,
  });

  // app.useGlobalPipes(
  //   new ValidationPipe({
  //     whitelist: true, // strips unknown properties
  //     transform: true, // enables auto-conversion (e.g. strings to numbers)
  //   }),
  // );

  const config = new DocumentBuilder()
    .setTitle('My API')
    .setDescription('The API description')
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

  const port = 3000;
  await app.listen(port);

  await open(`http://localhost:${port}/swagger`);
}

bootstrap();
