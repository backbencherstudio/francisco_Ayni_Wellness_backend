import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { HomeService } from './home.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SkipSubscription } from '../../common/decorator/skip-subscription.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('Home')
@UseGuards(JwtAuthGuard)
@SkipSubscription()
@Controller('home')
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Get('today')
  @ApiOperation({ summary: "Today's progress summary" })
  async today(@GetUser() user): Promise<any> {
    const userId = user?.userId || user?.id;
    return this.homeService.today(userId);
  }
}
