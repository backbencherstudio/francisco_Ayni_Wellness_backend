import { BadRequestException, Controller, Headers, Post, Req } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { Request } from 'express';

@Controller('payment/stripe')
export class StripeController {
  constructor(private readonly stripeService: StripeService) {}

  @Post('webhook')
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: Request,
  ) {
    try {
      const rawBody = (req as any).rawBody;
      const payload = rawBody
        ? rawBody.toString('utf8')
        : Buffer.isBuffer((req as any).body)
          ? (req as any).body.toString('utf8')
          : JSON.stringify((req as any).body ?? {});

      return await this.stripeService.handleWebhook(payload, signature);
    } catch (error: any) {
      throw new BadRequestException(
        error?.message || 'Stripe webhook signature verification failed',
      );
    }
  }
}
