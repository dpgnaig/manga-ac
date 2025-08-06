import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CrawlersModule } from './modules/crawlers/crawlers.module';
import { BaseUrlMiddleware } from './common/middleware/base-url.middleware';
import { CuuTruyenModule } from './modules/cuutruyen/cuutruyen.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule, AuthModule, UsersModule, CrawlersModule, CuuTruyenModule],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URI', ''), // fallback to '' or throw error if undefined
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(BaseUrlMiddleware).forRoutes('*'); // apply globally
  }
}