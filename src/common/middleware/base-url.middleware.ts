import { Injectable, NestMiddleware } from '@nestjs/common';

@Injectable()
export class BaseUrlMiddleware implements NestMiddleware {
    use(req: any, res: any, next: () => void) {
        const mangaSource = req.header('x-manga-source');
        if (mangaSource) {
            req['mangaSource'] = mangaSource; // attach to request
        }
        next();
    }
}