import { ApiProperty } from '@nestjs/swagger';

export class StateRequestDto {
    @ApiProperty({ example: 2637 })
    manga_readed_id: number
    @ApiProperty({ example: 49897 })
    chapter_readed_id: number;
}