import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression, Interval } from '@nestjs/schedule';
import { CuuTruyenService } from '../cuutruyen/cuutruyen.service';
import { ConfigService } from '@nestjs/config';
import { SavedMangaChapterService } from '../saved-manga-chapter/saved-manga-chapter.service';
import { SavedChapterData } from '../saved-manga-chapter/dto/saved-manga-chapter.dto';
import { ProcessGateway } from 'src/common/process.gateway';

@Injectable()
export class TasksService {
    constructor(
        private readonly config: ConfigService,
        private readonly cuuTruyenService: CuuTruyenService,
        private readonly savedMangaChapterService: SavedMangaChapterService,
        private readonly gateway: ProcessGateway
    ) { }

    private isRunning: boolean = false;
    private readonly logger = new Logger(TasksService.name);

    @Cron('*/2 * * * *')
    async handleCronSequence() {
        if (this.isRunning) return;

        try {
            this.logger.log("Start cronjob automatically download manga")
            this.isRunning = true;

            const res = await this.savedMangaChapterService.getNotDownloadedChapters(this.config.get('LIMITED_DOWNLOAD_MANGA') || 5);

            if (res.length === 0) {
                this.logger.log("No Chapter waiting for download")
                this.isRunning = false;
                return;
            }

            const listSavedMangas = res.map(x => ({
                process_id: `${x.mangaId}_${x.chapterId}`,
                manga_id: x.mangaId,
                chapter_id: x.chapterId,
            }));

            this.logger.log(`There are [${res.map(x => x.chapterId).join(', ')}] chapters waiting for download`);

            const upsertMap = new Map<number, SavedChapterData[]>();
            for (const manga of listSavedMangas) {
                const res = await this.cuuTruyenService.getChapterPagesAsync(manga);
                if (res) {
                    if (!upsertMap.has(manga.manga_id)) {
                        upsertMap.set(manga.manga_id, []);
                    }

                    const chapterData: SavedChapterData = {
                        chapterId: res.id,
                        totalImages: res.total_source_images,
                        totalSavedImages: res.images.length,
                    }
                    upsertMap.get(manga.manga_id)!.push(chapterData);
                    this.gateway.sendNotify(manga.process_id, `Đã tải xong C. ${res.number} - ${res.name ?? "Không có tiêu đề"}`)
                }

            }

            this.logger.log(`Running update/insert saved manga`);
            console.log(upsertMap);
            await Promise.all(
                Array.from(upsertMap.entries()).map(([mangaId, chapterDatas]) =>
                    this.savedMangaChapterService.upsertSavedMangaChapter(mangaId, chapterDatas)
                )
            );
        } catch (error) {
            this.logger.log(`Cron job seem to be error: ${error}`);
            this.isRunning = false;
        } finally {
            this.logger.log(`Cronjob is completed`);
            this.isRunning = false;
        }
    }
}
