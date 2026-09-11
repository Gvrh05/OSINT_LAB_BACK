import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { TseService, LoadMetadata } from './tse.service';

@Controller('tse')
export class TseController {
  constructor(private readonly tseService: TseService) {}

  @Post('download')
  download(@Body() body: { filePath?: string }): Promise<LoadMetadata> {
    return this.tseService.downloadAndLoadPadron(body?.filePath);
  }

  @Get('status')
  status() {
    return this.tseService.getStatus();
  }

  @Get('data')
  data(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.tseService.getData(
      Math.max(1, parseInt(page ?? '1', 10) || 1),
      Math.min(500, Math.max(1, parseInt(limit ?? '50', 10) || 50)),
    );
  }

  @Get('search')
  search(
    @Query('q') q: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.tseService.searchPadron(
      q,
      Math.max(1, parseInt(page ?? '1', 10) || 1),
      Math.min(500, Math.max(1, parseInt(limit ?? '50', 10) || 50)),
    );
  }

  @Get('stats')
  stats() {
    return this.tseService.getStats();
  }

  @Get('stats/cantones')
  cantones(@Query('provincia') provincia: string) {
    return this.tseService.getCantones(provincia);
  }

  @Get('distritos-electorales')
  distritosELECTORALES() {
    return this.tseService.getDistritos();
  }
}
