import { Module } from '@nestjs/common';
import { OijController } from './oij.controller';
import { OijService } from './oij.service';

@Module({
  controllers: [OijController],
  providers: [OijService],
  exports: [OijService],
})
export class OijModule {}