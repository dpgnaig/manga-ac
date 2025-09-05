import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { BaseUrlMiddleware } from './common/middleware/base-url.middleware';
import { CuuTruyenModule } from './modules/cuutruyen/cuutruyen.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { StatesModule } from './modules/states/states.module';
import { join } from 'path';
import { ScheduleModule } from '@nestjs/schedule';
import { TasksService } from './modules/tasks/task.service';
import { SavedMangaChapterModule } from './modules/saved-manga-chapter/saved-manga-chapter.module';
import { ProcessGateway } from './common/process.gateway';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule, AuthModule, UsersModule, CuuTruyenModule, StatesModule, SavedMangaChapterModule],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URI', ''), // fallback to '' or throw error if undefined
      }),
      inject: [ConfigService],
    }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'images'), // serve /uploads folder
      serveRoot: '/static', // base URL prefix
      serveStaticOptions: {
        setHeaders: (res, path) => {
          res.setHeader('Cache-Control', 'public, max-age=31536000'); // cache forever
          res.removeHeader('Content-Encoding'); // just in case
        },
      },
    }),
    ScheduleModule.forRoot(),
    CuuTruyenModule,
    SavedMangaChapterModule,
  ],
  controllers: [AppController],
  providers: [AppService, TasksService, ProcessGateway],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(BaseUrlMiddleware).forRoutes('*'); // apply globally
  }
}