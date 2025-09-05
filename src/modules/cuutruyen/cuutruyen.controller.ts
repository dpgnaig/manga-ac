import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { CuuTruyenService } from './cuutruyen.service';
import { ApiParam } from '@nestjs/swagger';
import { CuuTruyenDto, CuuTruyenDurationDto } from './dto/cuutruyen.dto';
import { Auth } from '../auth/decorators/auth.decorator';
import { User } from 'src/common/decorator/user.decorator';

@Controller('cuutruyen')
export class CuuTruyenController {
    constructor(private readonly cuuTruyenService: CuuTruyenService) { }

    @Get('manga-home')
    getDataHomePage() {
        return this.cuuTruyenService.getDataHomePageAsync();
    }

    @Auth()
    @Get('search-manga/:keyword')
    @ApiParam({ name: 'keyword', type: String, description: 'Keyword to find manga' })
    getMangaByKeyword(@Param('keyword') keyword: string) {
        return this.cuuTruyenService.getMangaByKeywordAsync(keyword);
    }

    @Auth()
    @Get('manga-info/:id')
    @ApiParam({ name: 'id', type: String, description: 'Manga ID to get Manga detail' })
    getMangaInfo(@Param('id') id: number, @User() user: any) {
        return this.cuuTruyenService.getMangaInfoAsync(id, user.sub);
    }

    @Auth()
    @Get('chapter-info/:id')
    @ApiParam({ name: 'id', type: String, description: 'Chapter ID to get Chapter detail' })
    getChapterInfo(@Param('id') id: number) {
        return this.cuuTruyenService.getChapterInfoAsync(id);
    }

    @Auth()
    @Post('download-manga')
    async getChapterPages(@Body() dto: CuuTruyenDto, @User() user: any) {
        return await this.cuuTruyenService.getChapterPagesAsync(dto, user.sub);
    }

    @Post('manga-duration')
    getTopMangaDurations(@Body() dto: CuuTruyenDurationDto) {
        return this.cuuTruyenService.getTopMangasDurationAsync(dto);
    }
}
