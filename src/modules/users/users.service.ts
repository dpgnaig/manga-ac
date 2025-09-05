import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from './users.schema';
import { Model, Types } from 'mongoose';

@Injectable()
export class UsersService {
    constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) { }

    async findByEmail(email: string) {
        return this.userModel.findOne({ email }).exec();
    }

    async create(data: Partial<User>): Promise<User> {
        const newUser = new this.userModel(data);
        return newUser.save();
    }


    async updateLoginAt(userId: Types.ObjectId | string): Promise<UserDocument | null> {
        return this.userModel.findByIdAndUpdate(
            userId,
            { $set: { loginAt: new Date() } }, // includes full date + time
            { new: true }
        ).exec();
    }
}
