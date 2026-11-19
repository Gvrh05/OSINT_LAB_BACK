import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TseModule } from './tse/tse.module';
import { OijModule } from './oij/oij.module';
import { SearchModule } from './search/search.module';
import { OsmModule } from './osm/osm.module';

@Module({
  imports: [TseModule, OijModule, SearchModule, OsmModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
