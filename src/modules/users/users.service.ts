import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from './users.schema';
import { Model } from 'mongoose';

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
}
