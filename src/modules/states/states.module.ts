import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StatesService } from './states.service';
import { State, StateSchema } from './states.schema';
import { StatesController } from './states.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: State.name, schema: StateSchema }])],
  providers: [StatesService],
  exports: [StatesService],
  controllers: [StatesController]
})
export class StatesModule { }
