import { IsOptional, IsPositive, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class PaginationDto {
    @IsOptional()
    @Type(() => Number)
    @IsPositive()
    @ApiProperty({ example: '10' })
    limit?: number;

    @IsOptional()
    @Type(() => Number)
    @Min(0)
    @ApiProperty({ example: '0' })
    offset?: number;
}