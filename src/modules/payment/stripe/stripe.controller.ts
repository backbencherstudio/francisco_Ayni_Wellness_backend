import { Controller, Post, Req, Headers } from '@nestjs/common';
import { SkipSubscription } from '../../../common/decorator/skip-subscription.decorator';
import { StripeService } from './stripe.service';
import { Request } from 'express';
import { TransactionRepository } from '../../../common/repository/transaction/transaction.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { StripePayment } from '../../../common/lib/Payment/stripe/StripePayment';

@Controller('payment/stripe')
@SkipSubscription()
export class StripeController {
  constructor(
    private readonly stripeService: StripeService,
    private prisma: PrismaService,
  ) {}

  @Post('webhook')
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: Request,
  ) {
    try {
      console.log('Webhook received:', req.rawBody, signature); 
      const payload = req.rawBody.toString();
      const event = await this.stripeService.handleWebhook(payload, signature);

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
        case 'payment_intent.payment_failed':
          const failedPaymentIntent = event.data.object;
          // Update transaction status in database
          await TransactionRepository.updateTransaction({
            reference_number: failedPaymentIntent.id,
            status: 'failed',
            raw_status: failedPaymentIntent.status,
          });
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
        case 'customer.subscription.updated':
          const subObj: any = event.data.object;
          try {
            const userId = subObj.metadata?.user_id; // ensure you set metadata when creating subscription
            if (userId) {
              // fetch payment method details
              let pmBrand: string | undefined;
              let pmLast4: string | undefined;
              let pmFunding: string | undefined;
              let pmType: string | undefined;
              let pmId: string | undefined;
              if (subObj.default_payment_method) {
                const pm = await StripePayment.retrievePaymentMethod(
                  subObj.default_payment_method as string,
                );
                pmId = pm.id;
                if (pm?.card) {
                  pmBrand = pm.card.brand;
                  pmLast4 = pm.card.last4;
                  pmFunding = pm.card.funding;
                  pmType = 'card';
                }
              }
              const existing = await this.prisma.subscription.findFirst({
                where: { subscription_id: subObj.id },
              });
              const data = {
                user_id: userId,
                plan_name:
                  subObj.items?.data?.[0]?.price?.recurring?.interval === 'year'
                    ? 'yearly'
                    : 'monthly',
                description: subObj.items?.data?.[0]?.price?.nickname,
                plan_id: subObj.items?.data?.[0]?.price?.id,
                price: subObj.items?.data?.[0]?.price?.unit_amount
                  ? subObj.items?.data?.[0]?.price?.unit_amount / 100
                  : undefined,
                currency:
                  subObj.items?.data?.[0]?.price?.currency?.toUpperCase?.(),
                interval: subObj.items?.data?.[0]?.price?.recurring?.interval,
                status: subObj.status === 'active' ? 'active' : subObj.status,
                start_date: subObj.start_date
                  ? new Date(subObj.start_date * 1000)
                  : new Date(),
                end_date: subObj.current_period_end
                  ? new Date(subObj.current_period_end * 1000)
                  : undefined,
                next_billing_date: subObj.current_period_end
                  ? new Date(subObj.current_period_end * 1000)
                  : undefined,
                trial_start: subObj.trial_start
                  ? new Date(subObj.trial_start * 1000)
                  : undefined,
                trial_end: subObj.trial_end
                  ? new Date(subObj.trial_end * 1000)
                  : undefined,
                subscription_id: subObj.id,
                payment_method_id: pmId,
                payment_method_brand: pmBrand,
                payment_method_last4: pmLast4,
                payment_method_funding: pmFunding,
                payment_method_type: pmType,
              };
              if (existing) {
                await this.prisma.subscription.update({
                  where: { id: existing.id },
                  data,
                });
              } else {
                await this.prisma.subscription.create({ data });
              }
            }
          } catch (e) {
            console.error('Failed to upsert subscription from webhook', e);
          }
          break;
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
