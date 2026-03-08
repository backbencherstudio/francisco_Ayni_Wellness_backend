import { Body, Controller, Get, Headers, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AppleWebhookDto } from './dto/apple-webhook.dto';
import { CancelIapDto } from './dto/cancel-iap.dto';
import { GoogleWebhookDto } from './dto/google-webhook.dto';
import { RestoreIapDto } from './dto/restore-iap.dto';
import { VerifyAppleIapDto } from './dto/verify-apple-iap.dto';
import { VerifyGoogleIapDto } from './dto/verify-google-iap.dto';
import { IapService } from './iap.service';

@ApiTags('iap')
@Controller('iap')
export class IapController {
  constructor(private readonly iapService: IapService) {}

  @ApiOperation({ summary: 'Verify Apple mobile subscription payload and upsert entitlement snapshot' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('verify/apple')
  async verifyApple(
    @GetUser('userId') userId: string,
    @Body() dto: VerifyAppleIapDto,
  ) {
    return this.iapService.verifyApple(userId, dto);
  }

  @ApiOperation({ summary: 'Verify Google mobile subscription payload and upsert entitlement snapshot' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('verify/google')
  async verifyGoogle(
    @GetUser('userId') userId: string,
    @Body() dto: VerifyGoogleIapDto,
  ) {
    return this.iapService.verifyGoogle(userId, dto);
  }

  @ApiOperation({ summary: 'Restore latest mobile entitlement (Apple/Google) for logged-in user' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('restore')
  async restore(@GetUser('userId') userId: string, @Body() dto: RestoreIapDto) {
    return this.iapService.restore(userId, dto);
  }

  @ApiOperation({ summary: 'Get current mobile IAP subscription status for logged-in user' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('subscription/status')
  async getCurrentSubscriptionStatus(@GetUser('userId') userId: string) {
    return this.iapService.getCurrentSubscriptionStatus(userId);
  }

  @ApiOperation({ summary: 'Get provider-specific cancel instructions/links (Apple or Google)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('subscription/cancel')
  async cancelInStore(
    @GetUser('userId') userId: string,
    @Body() dto: CancelIapDto,
  ) {
    return this.iapService.cancelInStore(userId, dto);
  }

  @ApiOperation({ summary: 'Apple server notification ingest (Phase 3, protected by webhook secret)' })
  @Post('webhook/apple')
  async appleWebhook(
    @Headers('x-iap-webhook-secret') webhookSecret: string,
    @Body() dto: AppleWebhookDto,
  ) {
    this.assertWebhookSecret(webhookSecret);
    return this.iapService.logAppleWebhook(dto);
  }

  @ApiOperation({ summary: 'Google RTDN relay ingest (Phase 3, protected by webhook secret)' })
  @Post('webhook/google')
  async googleWebhook(
    @Headers('x-iap-webhook-secret') webhookSecret: string,
    @Body() dto: GoogleWebhookDto,
  ) {
    this.assertWebhookSecret(webhookSecret);
    return this.iapService.logGoogleWebhook(dto);
  }

  private assertWebhookSecret(headerSecret: string | undefined) {
    const expectedSecret = process.env.IAP_WEBHOOK_SECRET;
    if (!expectedSecret) {
      throw new UnauthorizedException(
        'IAP_WEBHOOK_SECRET is not configured on server',
      );
    }

    if (!headerSecret || headerSecret !== expectedSecret) {
      throw new UnauthorizedException('Invalid IAP webhook secret');
    }
  }
}
