import { Module } from '@nestjs/common';
import { CuuTruyenService } from './cuutruyen.service';
import { CuuTruyenController } from './cuutruyen.controller';
import { ProcessGateway } from 'src/common/process.gateway';
import { StatesModule } from '../states/states.module';
import { SavedMangaChapterModule } from '../saved-manga-chapter/saved-manga-chapter.module';

@Module({
  imports: [StatesModule, SavedMangaChapterModule],
  providers: [CuuTruyenService, ProcessGateway],
  controllers: [CuuTruyenController],
  exports: [CuuTruyenService]
})
export class CuuTruyenModule { }
