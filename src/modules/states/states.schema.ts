import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StateDocument = State & Document<Types.ObjectId>;

@Schema({ timestamps: true })
export class State {
    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    user: Types.ObjectId;

    @Prop({ required: true })
    mangaReadedId: number;

    @Prop({ required: true })
    chapterReadedId: number;
}

export const StateSchema = SchemaFactory.createForClass(State);
