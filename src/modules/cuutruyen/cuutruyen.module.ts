import { Module } from '@nestjs/common';
import { CuuTruyenService } from './cuutruyen.service';
import { CuuTruyenController } from './cuutruyen.controller';

@Module({
  providers: [CuuTruyenService],
  controllers: [CuuTruyenController]
})
export class CuuTruyenModule { }
