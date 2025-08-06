import { ApiProperty } from "@nestjs/swagger";

export interface MangaInfoResponse {
    href: string;
    mangaName: string;
}

export interface ChapterInfoResponse {
    href: string;
    name: string;
    chapterNum: number;
    updatedAt: string;
}

export interface ChapterImageResponse {
    url?: string;
    base64Image?: string;
}

export class RequestChapterDto {
    baseUrl: string;
    mangaSlug: string;
}

export class RequestChapterImageDto {
    baseUrl: string;
    href: string;
}