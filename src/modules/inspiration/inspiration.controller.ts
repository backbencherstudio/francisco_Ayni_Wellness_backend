import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { InspirationService } from './inspiration.service';
import { CreateInspirationDto } from './dto/create-inspiration.dto';
import { UpdateInspirationDto } from './dto/update-inspiration.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionOnly } from '../../common/decorator/subscription-only.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('Inspiration')
@Controller('inspiration')
@UseGuards(JwtAuthGuard)
@SubscriptionOnly()
export class InspirationController {
  constructor(private readonly inspirationService: InspirationService) {}

  @ApiOperation({ summary: 'Get daily inspiration Quote' })
  @Get(':keyword')
  async getDailyInspiration(
    @GetUser() user,
    @Param('keyword') keyword: string,
  ) {
    try {
      return await this.inspirationService.getDailyInspiration(
        user.userId,
        keyword,
      );
    } catch (error) {
      return {
        message: 'Error fetching daily inspiration',
        status: false,
        error,
      };
    }
  }
}
