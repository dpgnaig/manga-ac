import { ApiProperty } from '@nestjs/swagger';

export class CreateSavedMangaChapterDto {
    @ApiProperty({ example: 2637 })
    mangaId: number;
    @ApiProperty({ example: [{ chapterId: 49897, totalImages: 10, totalSavedImages: 10 }] })
    chapterIds: SavedChapterData[];
    @ApiProperty({ example: false })
    isDownloaded: boolean = false;
}

export interface SavedChapterData {
    chapterId: number;
    totalImages: number | null;
    totalSavedImages: number | null;
}
