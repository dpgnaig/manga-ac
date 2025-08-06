import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { CrawlersController } from './crawlers.controller';
import { CrawlersService } from './crawlers.service';
import { BaseUrlMiddleware } from 'src/common/middleware/base-url.middleware';

@Module({
    controllers: [CrawlersController],
    providers: [CrawlersService],
    exports: [CrawlersService],
})

export class CrawlersModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer
            .apply(BaseUrlMiddleware)
            .forRoutes(CrawlersController); // or specific route path
    }
}
