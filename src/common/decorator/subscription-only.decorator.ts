import { SetMetadata } from '@nestjs/common';

export const SUBSCRIPTION_ONLY_KEY = 'subscriptionOnly';
export const SubscriptionOnly = () => SetMetadata(SUBSCRIPTION_ONLY_KEY, true);
