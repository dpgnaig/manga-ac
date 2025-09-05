import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SavedMangaChapter, SavedMangaChapterSchema } from './saved-manga-chapter.schema';
import { SavedMangaChapterService } from './saved-manga-chapter.service';
import { SavedMangaChapterController } from './saved-manga-chapter.controller';
import { UsersModule } from '../users/users.module';

@Module({
    imports: [
        UsersModule,
        MongooseModule.forFeature([
            { name: SavedMangaChapter.name, schema: SavedMangaChapterSchema },
        ]),
    ],
    controllers: [SavedMangaChapterController],
    providers: [SavedMangaChapterService],
    exports: [SavedMangaChapterService],
})
export class SavedMangaChapterModule { }
