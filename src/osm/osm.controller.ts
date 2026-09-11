import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { OsmService } from './osm.service';

@Controller('osm')
export class OsmController {
  constructor(private readonly osmService: OsmService) {}

  @Get('cantons')
  getCantons() {
    return this.osmService.getCantons();
  }

  @Get('pois')
  getPois(@Query('canton') canton: string, @Query('categoria') categoria?: string) {
    const cantonId = Number(canton);
    if (!Number.isInteger(cantonId)) {
      throw new BadRequestException('El parámetro "canton" debe ser un id numérico.');
    }
    return this.osmService.getPois(cantonId, categoria);
  }

  @Get('summary')
  getSummary(@Query('canton') canton: string) {
    const cantonId = Number(canton);
    if (!Number.isInteger(cantonId)) {
      throw new BadRequestException('El parámetro "canton" debe ser un id numérico.');
    }
    return this.osmService.getSummary(cantonId);
  }
}