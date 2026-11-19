import { Module } from '@nestjs/common';
import { TseController } from './tse.controller';
import { TseService } from './tse.service';

@Module({
  controllers: [TseController],
  providers: [TseService],
})
export class TseModule {}
