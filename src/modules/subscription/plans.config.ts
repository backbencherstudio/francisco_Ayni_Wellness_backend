export interface PlanDefinition {
  key: 'monthly' | 'yearly' | 'trial';
  name: string;
  interval: 'month' | 'year';
  price: number; 
  currency: string; 
  stripePriceId?: string; 
  trialDays: number; 
  features: string[]; 
}

export const PLANS: PlanDefinition[] = [
  {
    key: 'trial',
    name: 'Free Trial',
    interval: 'month',
    price: 0,
    currency: 'usd',
    stripePriceId: process.env.STRIPE_PRICE_TRIAL,
    trialDays: 30,
    features: [
      'AI-Driven Personalized Routines',
      'Guided Access to Content',
      'Redo & Complete Routines',
      'Curated Content Access',
      'Cancel anytime',
    ],
  },
  {
    key: 'monthly',
    name: 'Monthly Subscription',
    interval: 'month',
    price: 19.99,
    currency: 'usd',
    stripePriceId: process.env.STRIPE_PRICE_MONTHLY,
    trialDays: Number(process.env.TRIAL_DAYS) || 30,
    features: [
      'AI-Driven Personalized Routines',
      'Guided Access to Content',
      'Redo & Complete Routines',
      'Curated Content Access',
      'Cancel anytime',
    ],
  },
  {
    key: 'yearly',
    name: 'Yearly Subscription',
    interval: 'year',
    price: 199.99,
    currency: 'usd',
    stripePriceId: process.env.STRIPE_PRICE_YEARLY,
    trialDays: Number(process.env.TRIAL_DAYS) || 30,
    features: [
      'AI-Driven Personalized Routines',
      'Guided Access to Content',
      'Redo & Complete Routines',
      'Curated Content Access',
      'Cancel anytime',
      'Save 2 months compared to monthly',
    ],
  },
];

export function findPlan(key: string) {
  return PLANS.find((p) => p.key === key);
}
