import { Test, TestingModule } from '@nestjs/testing';
import { InspirationService } from './inspiration.service';

describe('InspirationService', () => {
  let service: InspirationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InspirationService],
    }).compile();

    service = module.get<InspirationService>(InspirationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
