import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TseModule } from './tse/tse.module';
import { OijModule } from './oij/oij.module';
import { SearchModule } from './search/search.module';

@Module({
  imports: [
    TseModule,
    OijModule,
    SearchModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
