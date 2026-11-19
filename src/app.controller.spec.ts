import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('debe exponer información del proyecto y sus rutas', () => {
      const info = appController.getHello() as {
        proyecto: string;
        rutas: { tse: { download: string } };
      };
      expect(info.proyecto).toContain('OSINT');
      expect(info.rutas.tse.download).toContain('/api/tse/download');
    });
  });
});
