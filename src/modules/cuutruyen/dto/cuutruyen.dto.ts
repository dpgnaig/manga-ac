import { ApiProperty } from '@nestjs/swagger';

export class CuuTruyenDto {
    @ApiProperty({ example: 2637 })
    manga_id: number;
    @ApiProperty({ example: 49897 })
    chapter_id: number;
    @ApiProperty({ example: '9b6918362f' })
    process_id: string;
}

export class CuuTruyenDurationDto {
    @ApiProperty({ example: 'week' })
    duration_type: string;
    @ApiProperty({ example: '1' })
    current_page: number;
    @ApiProperty({ example: '24' })
    per_page: number;
}
