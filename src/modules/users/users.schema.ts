import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Role } from 'src/common/enums/roles.enum';

export type UserDocument = User & Document<Types.ObjectId>;

@Schema()
export class User {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop()
  name: string;

  @Prop({ type: Date, default: () => new Date() })
  loginAt: Date;

  @Prop({ type: [String], enum: Role, default: [Role.NormalUser] })
  roles: Role[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'State' }] })
  states?: Types.ObjectId[]; // Optional, if you want population from User -> States
}

export const UserSchema = SchemaFactory.createForClass(User);
