import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TseModule } from './tse/tse.module';

@Module({
  imports: [TseModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
