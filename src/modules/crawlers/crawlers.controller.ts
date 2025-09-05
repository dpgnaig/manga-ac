import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { CrawlersService } from './crawlers.service';
import { RequestChapterDto, RequestChapterImageDto } from './dto/chapterInfo.dto';
import { ApiQuery } from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { GetMangaSource } from '../auth/decorators/get-manga-source.decorator';


@Controller('crawlers')
export class CrawlersController {
    constructor(
        private crawlersService: CrawlersService,
    ) { }

    @Auth()
    @Get('list-chapter-infos')
    @ApiQuery({ name: 'slug', type: String, description: 'Manga slug (e.g., one-piece-128)' })
    getChapterInfosAsync(@GetMangaSource() source: string, @Query('slug') slug: string) {
        const dto: RequestChapterDto = { baseUrl: source, mangaSlug: slug }
        return this.crawlersService.getChapterNodesAsync(dto);
    }

    @Auth()
    @Get('list-images')
    @ApiQuery({ name: 'href', type: String, description: 'Manga href (e.g., truyen-tranh/one-piece-128-chap-1.html)' })
    getImagesFromUrlAsync(@GetMangaSource() source: string, @Query('href') href: string) {
        const dto: RequestChapterImageDto = { baseUrl: source, href: href }
        return this.crawlersService.extractImageUrlsAsync(dto);
    }
}
