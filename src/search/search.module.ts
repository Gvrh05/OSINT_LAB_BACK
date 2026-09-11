import { Module } from '@nestjs/common';
import { OijModule } from '../oij/oij.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [OijModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
