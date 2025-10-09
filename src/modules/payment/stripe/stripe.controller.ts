import { Controller, Post, Req, Headers } from '@nestjs/common';
import { SkipSubscription } from '../../../common/decorator/skip-subscription.decorator';
import { StripeService } from './stripe.service';
import { Request } from 'express';
import { TransactionRepository } from '../../../common/repository/transaction/transaction.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { StripePayment } from '../../../common/lib/Payment/stripe/StripePayment';
import { AppSubscriptionService } from '../../subscription/subscription.service';
// This controller is now subscription/payment (Stripe) only; order purchase flow removed.

@Controller('payment/stripe')
@SkipSubscription()
export class StripeController {
  constructor(
    private readonly stripeService: StripeService,
    private prisma: PrismaService,
    private subService: AppSubscriptionService,
  ) {}

  @Post('webhook')
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: Request,
  ) {
    try {
      // Reconstruct raw body resiliently
      let raw: string;
      const anyReq: any = req as any;
      if (anyReq.body && Buffer.isBuffer(anyReq.body)) {
        raw = anyReq.body.toString('utf8');
      } else if (typeof anyReq.rawBody === 'string') {
        raw = anyReq.rawBody;
      } else if (anyReq.rawBody && Buffer.isBuffer(anyReq.rawBody)) {
        raw = anyReq.rawBody.toString('utf8');
      } else {
        raw = JSON.stringify(anyReq.body || {});
      }
      console.log('Webhook received raw length:', raw.length);

      let event: any;
      try {
        if (!signature) throw new Error('Missing stripe-signature header');
        event = await this.stripeService.handleWebhook(raw, signature);
      } catch (sigErr) {
        const devBypass =
          process.env.NODE_ENV !== 'production' &&
          process.env.STRIPE_WEBHOOK_DEV_BYPASS === '1';
        if (devBypass) {
          console.warn(
            '[Webhook Dev Bypass] Signature verification failed or missing. Using parsed body. Reason:',
            sigErr.message,
          );
          try {
            event = JSON.parse(raw);
          } catch {
            event = { id: 'evt_dev_bypass', type: 'unknown', data: { object: {} } };
          }
        } else {
          throw sigErr;
        }
      }

      // Handle events
      switch (event.type) {
        case 'customer.created':
          break;
        case 'payment_intent.created':
          break;
        case 'payment_intent.succeeded':
          const paymentIntent = event.data.object;
          // create tax transaction
          // await StripePayment.createTaxTransaction(
          //   paymentIntent.metadata['tax_calculation'],
          // );
          // Update transaction status in database
          await TransactionRepository.updateTransaction({
            reference_number: paymentIntent.id,
            status: 'succeeded',
            paid_amount: paymentIntent.amount / 100, // amount in dollars
            paid_currency: paymentIntent.currency,
            raw_status: paymentIntent.status,
          });
          break;
        case 'payment_intent.payment_failed': {
          const failedPaymentIntent = event.data.object;
          await TransactionRepository.updateTransaction({
            reference_number: failedPaymentIntent.id,
            status: 'failed',
            raw_status: failedPaymentIntent.status,
          });
          break;
        }
        case 'payment_intent.canceled':
          const canceledPaymentIntent = event.data.object;
          // Update transaction status in database
          await TransactionRepository.updateTransaction({
            reference_number: canceledPaymentIntent.id,
            status: 'canceled',
            raw_status: canceledPaymentIntent.status,
          });
          break;
        case 'payment_intent.requires_action':
          const requireActionPaymentIntent = event.data.object;
          // Update transaction status in database
          await TransactionRepository.updateTransaction({
            reference_number: requireActionPaymentIntent.id,
            status: 'requires_action',
            raw_status: requireActionPaymentIntent.status,
          });
          break;
        case 'payout.paid':
          const paidPayout = event.data.object;
          console.log(paidPayout);
          break;
        case 'payout.failed':
          const failedPayout = event.data.object;
          console.log(failedPayout);
          break;
        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const subObj: any = event.data.object;
          try {
            await this.subService.syncFromStripe(subObj);
          } catch (e) {
            console.error('Subscription sync failed', e);
          }
          break; }
        case 'customer.subscription.deleted':
          const deletedSub: any = event.data.object;
          await this.prisma.subscription.updateMany({
            where: { subscription_id: deletedSub.id },
            data: { status: 'canceled', canceled_at: new Date() },
          });
          break;
        default:
          // console.log(`Unhandled event type ${event.type}`);
          break;
      }

      return { received: true };
    } catch (error) {
      console.error('Webhook error', error);
      return { received: false };
    }
  }
}
