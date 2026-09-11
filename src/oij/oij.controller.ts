import {
  Controller,
  Get,
  Query,
} from '@nestjs/common';

import { OijService } from './oij.service';

@Controller('oij')
export class OijController {
  constructor(
    private readonly oijService: OijService,
  ) {}

  @Get()
  getStatus() {
    return this.oijService.getStatus();
  }

  @Get('search')
  search(
    @Query('q') q?: string,
    @Query('province') province?: string,
    @Query('canton') canton?: string,
    @Query('crime') crime?: string,
    @Query('year') year?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.oijService.search({
      q,
      province,
      canton,
      crime,
      year,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }

  @Get('summary')
  getSummary(@Query('year') year?: string) {
    return this.oijService.getSummary(year);
  }

  @Get('filters')
  getFilters() {
    return this.oijService.getFilters();
  }

  @Get('trends')
  getTrends(@Query('year') year?: string) {
    return this.oijService.getTrends(year);
  }

  @Get('statistics')
  getStatistics(
    @Query('groupBy') groupBy?: 'year' | 'month' | 'province' | 'crime',
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('province') province?: string,
    @Query('crime') crime?: string,
  ) {
    return this.oijService.getStatistics({ groupBy, year, month, province, crime });
  }

  @Get('crimes')
  getCrimes(@Query('year') year?: string) {
    return this.oijService.getCrimes(year);
  }

  @Get('locations')
  getLocations(@Query('year') year?: string) {
    return this.oijService.getLocations(year);
  }
}
