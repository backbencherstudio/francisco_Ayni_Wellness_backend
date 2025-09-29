import { Test, TestingModule } from '@nestjs/testing';
import { InspirationController } from './inspiration.controller';
import { InspirationService } from './inspiration.service';

describe('InspirationController', () => {
  let controller: InspirationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InspirationController],
      providers: [InspirationService],
    }).compile();

    controller = module.get<InspirationController>(InspirationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
