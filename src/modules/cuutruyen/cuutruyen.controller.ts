import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CuuTruyenService } from './cuutruyen.service';
import { ApiParam } from '@nestjs/swagger';
import { CuuTruyenDto, CuuTruyenDurationDto } from './dto/cuutruyen.dto';

@Controller('cuutruyen')
export class CuuTruyenController {
    constructor(private readonly cuuTruyenService: CuuTruyenService) { }

    @Get('manga-home')
    getDataHomePage() {
        return this.cuuTruyenService.getDataHomePageAsync();
    }

    @Get('search-manga/:keyword')
    @ApiParam({ name: 'keyword', type: String, description: 'Keyword to find manga' })
    getMangaByKeyword(@Param('keyword') keyword: string) {
        return this.cuuTruyenService.getMangaByKeywordAsync(keyword);
    }

    @Get('manga-info/:id')
    @ApiParam({ name: 'id', type: String, description: 'Manga ID to get Manga detail' })
    getMangaInfo(@Param('id') id: number) {
        return this.cuuTruyenService.getMangaInfoAsync(id);
    }

    @Get('chapter-info/:id')
    @ApiParam({ name: 'id', type: String, description: 'Chapter ID to get Chapter detail' })
    // , @Query() paginationDto: PaginationDto
    getChapterInfo(@Param('id') id: number) {
        return this.cuuTruyenService.getChapterInfoAsync(id);
    }

    @Post('download-manga')
    async getChapterPages(@Body() dto: CuuTruyenDto) {
        return await this.cuuTruyenService.getChapterPagesAsync(dto);

    }

    @Post('manga-duration')
    getTopMangaDurations(@Body() dto: CuuTruyenDurationDto) {
        return this.cuuTruyenService.getTopMangasDurationAsync(dto);
    }
}
