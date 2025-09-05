import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SavedMangaChapter, SavedMangaChapterDocument } from './saved-manga-chapter.schema';
import { SavedChapterData } from './dto/saved-manga-chapter.dto';

@Injectable()
export class SavedMangaChapterService {
    constructor(
        @InjectModel(SavedMangaChapter.name)
        private readonly savedModel: Model<SavedMangaChapterDocument>,
    ) { }

    /**
  * Insert or update one or multiple chapters
  */
    async upsertSavedMangaChapter(mangaId: number, chapters: SavedChapterData[]) {
        const ops = chapters.map((chapter) => ({
            updateOne: {
                filter: { mangaId, chapterId: chapter.chapterId },
                update: [
                    {
                        $set: {
                            mangaId: Number(mangaId), // Keep original mangaId value as number
                            chapterId: Number(chapter.chapterId),
                            // Only update totalImages if incoming value > 0 OR if field doesn't exist
                            totalImages: {
                                $cond: {
                                    if: {
                                        $or: [
                                            { $gt: [chapter.totalImages, 0] },
                                            { $eq: [{ $ifNull: ["$totalImages", 0] }, 0] }
                                        ]
                                    },
                                    then: chapter.totalImages,
                                    else: "$totalImages"
                                }
                            },
                            // Only update totalSavedImages if incoming value > 0 OR if field doesn't exist
                            totalSavedImages: {
                                $cond: {
                                    if: {
                                        $or: [
                                            { $gt: [chapter.totalSavedImages, 0] },
                                            { $eq: [{ $ifNull: ["$totalSavedImages", 0] }, 0] }
                                        ]
                                    },
                                    then: chapter.totalSavedImages,
                                    else: "$totalSavedImages"
                                }
                            },
                        }
                    },
                    {
                        $set: {
                            // Calculate isDownloaded based on the final totalImages and totalSavedImages values
                            isDownloaded: {
                                $and: [
                                    { $gt: ["$totalImages", 0] },
                                    { $eq: ["$totalImages", "$totalSavedImages"] }
                                ]
                            }
                        }
                    }
                ],
                upsert: true,
            },
        }));

        await this.savedModel.bulkWrite(ops, { ordered: false });
        const ids = await this.savedModel
            .find(
                {
                    mangaId,
                    chapterId: { $in: chapters.map(c => c.chapterId) }
                },
                { mangaId: 1, chapterId: 1 } // include the fields you want
            )
            .lean();

        return ids.map(doc => `${doc.mangaId}_${doc.chapterId}`);
    }

    /**
     * Get downloaded chapter IDs grouped by mangaId
     */
    async getDownloadedChaptersGroupedByManga(mangaId: number) {
        const result = await this.savedModel.aggregate([
            {
                $match: {
                    mangaId: Number(mangaId), // ensure type matches MongoDB storage
                },
            },
            {
                $sort: { chapterId: 1 }, // make sure we keep a clean order
            },
            {
                $group: {
                    _id: '$mangaId',
                    chapters: {
                        $push: {
                            id: '$_id',
                            chapterId: '$chapterId',
                            isDownloaded: '$isDownloaded'
                        },
                    },
                },
            },
            {
                $project: {
                    _id: 0,
                    mangaId: '$_id',
                    chapters: 1,
                },
            },
        ]);

        return result.length > 0 ? result[0] : { mangaId, chapters: [] };
    }

    /**
    * Get all SavedMangaChapter with isDownloaded = false, limited to 10 items by default
    */
    async getNotDownloadedChapters(limit = 10) {
        return await this.savedModel
            .find({ isDownloaded: false })
            .limit(limit)
            .exec();
    }

    /**
    * Get a single SavedMangaChapter by mangaId and chapterId
    */
    async getSavedMangaChapter(mangaId: number, chapterId: number) {
        return await this.savedModel.findOne({
            mangaId: Number(mangaId),
            chapterId: Number(chapterId),
        }).exec();
    }
}
