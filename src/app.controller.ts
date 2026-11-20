import { Controller, Get, Header } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): Record<string, unknown> {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth(): { status: string } {
    return { status: 'ok' };
  }

  // Página HTML mínima para que el spider pasivo de ZAP descubra rutas de la API.
  @Get('scan')
  @Header('Content-Type', 'text/html; charset=utf-8')
  getScanIndex(): string {
    return '<!doctype html><html lang="es"><head><title>OSINT API</title></head><body><h1>OSINT API</h1><nav><a href="/api/health">Estado</a><a href="/api/oij">OIJ</a><a href="/api/tse/status">TSE</a></nav></body></html>';
  }
}
