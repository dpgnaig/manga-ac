import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { SavedMangaChapterService } from './saved-manga-chapter.service';
import { CreateSavedMangaChapterDto } from './dto/saved-manga-chapter.dto';
import { Auth } from '../auth/decorators/auth.decorator';
import { ApiParam } from '@nestjs/swagger';

@Controller('saved-mangamoi')
export class SavedMangaChapterController {
    constructor(private readonly savedService: SavedMangaChapterService) { }

    @Auth()
    @Post('upsert')
    async upsertChapter(
        @Body() dto: CreateSavedMangaChapterDto
    ) {
        return await this.savedService.upsertSavedMangaChapter(dto.mangaId, dto.chapterIds);
    }

    /**
     * Get downloaded chapters grouped by mangaId
     */
    @Get('downloaded/:mangaId')
    @ApiParam({ name: 'mangaId', type: String, description: 'MangaId to get dowloaded chapters' })
    async getDownloadedGrouped(@Param('mangaId') mangaId: number) {
        return await this.savedService.getDownloadedChaptersGroupedByManga(mangaId);
    }

    /**
     * Get up to N not-downloaded chapters (default: 10), oldest first
     */
    @Get('not-downloaded')
    async getNotDownloaded(@Query('limit') limit?: string) {
        const parsedLimit = limit ? parseInt(limit, 10) : 10;
        return await this.savedService.getNotDownloadedChapters(parsedLimit);
    }
}
