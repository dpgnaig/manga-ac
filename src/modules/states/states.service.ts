import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { State, StateDocument } from './states.schema';

@Injectable()
export class StatesService {
    constructor(
        @InjectModel(State.name) private readonly stateModel: Model<StateDocument>,
    ) { }

    /**
     * Create a new state for a user
     */
    async createState(userId: string, mangaReadedId: number, chapterReadedId: number) {
        const newState = new this.stateModel({
            user: new Types.ObjectId(userId),
            mangaReadedId,
            chapterReadedId,
        });
        return await newState.save();
    }

    /**
     * Update state for a given user + manga
     * If it doesn't exist, create it
     */
    async updateState(userId: string, mangaReadedId: number, chapterReadedId: number) {
        const state = await this.stateModel.findOne({
            user: new Types.ObjectId(userId),
            mangaReadedId,
        });

        if (state) {
            state.chapterReadedId = chapterReadedId;
            return await state.save();
        } else {
            // Create if not found
            return await this.createState(userId, mangaReadedId, chapterReadedId);
        }
    }

    /**
     * Get all states for a user
     */
    async getStatesByUser(userId: string) {
        return await this.stateModel
            .find({ user: new Types.ObjectId(userId) })
            .lean();
    }

    /**
     * Get a single state for a user + manga
     */
    async getState(userId: string, mangaReadedId: number) {
        return await this.stateModel.findOne({
            user: new Types.ObjectId(userId),
            mangaReadedId,
        }).lean();
    }

    async deleteState(userId: string, mangaReadedId: number) {
        const deleted = await this.stateModel.findOneAndDelete(
            {
                user: new Types.ObjectId(userId),
                mangaReadedId,
            },
            { lean: true } // return plain object instead of Mongoose document
        );

        if (!deleted) {
            // Optional: handle not found case
            return { success: false, message: 'State not found' };
        }

        return { success: true, deleted };
    }

}
