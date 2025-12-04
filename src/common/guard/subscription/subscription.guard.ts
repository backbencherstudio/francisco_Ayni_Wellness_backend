// import {
//   CanActivate,
//   ExecutionContext,
//   Injectable,
//   ForbiddenException,
// } from '@nestjs/common';
// import { Reflector } from '@nestjs/core';
// import { SKIP_SUBSCRIPTION_KEY } from '../../decorator/skip-subscription.decorator';
// import { SUBSCRIPTION_ONLY_KEY } from '../../decorator/subscription-only.decorator';
// import { PrismaService } from '../../../prisma/prisma.service';

// @Injectable()
// export class SubscriptionGuard implements CanActivate {
//   constructor(
//     private reflector: Reflector,
//     private prisma: PrismaService,
//   ) {}

//   async canActivate(context: ExecutionContext): Promise<boolean> {
//     const skip = this.reflector.getAllAndOverride<boolean>(SKIP_SUBSCRIPTION_KEY, [
//       context.getHandler(),
//       context.getClass(),
//     ]);
//     const subscriptionOnly = this.reflector.getAllAndOverride<boolean>(SUBSCRIPTION_ONLY_KEY, [
//       context.getHandler(),
//       context.getClass(),
//     ]);
//     if (skip) return true;

//     const request = context.switchToHttp().getRequest();
//   const user = request.user; 

//     // If no user (public or auth not applied) allow through (auth guard will handle if needed)
//     if (!user || !user.userId) return true;

//     const userId = user.userId;

//     // Fetch user (created_at used for trial window) and active subscription (if any)
//     const [active, activeTrial] = await Promise.all([
//       this.prisma.subscription.findFirst({
//         where: {
//           user_id: userId,
//           status: 'active',
//           OR: [
//             { end_date: null },
//             { end_date: { gt: new Date() } },
//           ],
//           NOT: { plan_name: 'trial' },
//         },
//       }),
//       this.prisma.subscription.findFirst({
//         where: {
//           user_id: userId,
//           status: 'active',
//           plan_name: 'trial',
//           end_date: { gt: new Date() },
//         },
//       }),
//     ]);

//     const hasActive = !!active;
//     const hasActiveTrial = !!activeTrial;

//     if (hasActive) return true; // paid plan

//     // Trial logic: if within TRIAL_DAYS (default 30) since user created_at, allow
//     const trialDays = Number(process.env.TRIAL_DAYS) || 30;
//     if (hasActiveTrial) {
//       if (subscriptionOnly) {
//         throw new ForbiddenException({
//           code: 'SUBSCRIPTION_REQUIRED',
//           message: 'A paid subscription is required to access this resource.',
//           redirect: '/subscription',
//           trial_active: true,
//           trial_ends_at: activeTrial.end_date?.toISOString?.(),
//         });
//       }
//       const trialEnd = activeTrial.end_date!;
//       request.trial = {
//         active: true,
//         ends_at: trialEnd.toISOString(),
//         days_remaining: Math.ceil(
//           (trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
//         ),
//       };
//       return true;
//     }

//     throw new ForbiddenException({
//       code: 'ACCESS_DENIED',
//       message:
//         'No active subscription. Start a trial or purchase a plan to continue.',
//       redirect: '/subscription',
//       trial_available: true,
//     });
//   }
// }
