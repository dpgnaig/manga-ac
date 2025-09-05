import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SavedMangaChapterDocument = SavedMangaChapter & Document<Types.ObjectId>;

@Schema({ timestamps: true })
export class SavedMangaChapter {
    @Prop({ type: Number, required: true })
    mangaId: number; // ID of the manga (from your source)

    @Prop({ type: Number, required: true })
    chapterId: number; // ID of the chapter (from your source)

    @Prop({ type: Number, default: 0 })
    totalImages: number;

    @Prop({ type: Number, default: 0 })
    totalSavedImages: number;

    @Prop({ type: Boolean, default: false })
    isDownloaded: boolean; // Optional flag for downloaded state
}

export const SavedMangaChapterSchema = SchemaFactory.createForClass(SavedMangaChapter);
