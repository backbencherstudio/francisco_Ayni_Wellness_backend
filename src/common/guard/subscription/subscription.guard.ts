import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SKIP_SUBSCRIPTION_KEY } from '../../decorator/skip-subscription.decorator';
import { SUBSCRIPTION_ONLY_KEY } from '../../decorator/subscription-only.decorator';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_SUBSCRIPTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const subscriptionOnly = this.reflector.getAllAndOverride<boolean>(
      SUBSCRIPTION_ONLY_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // If no user (public or auth not applied) allow through (auth guard will handle if needed)
    if (!user || !user.userId) return true;

    const userId = user.userId;

    // Fetch active subscription
    // We look for a subscription that is active, not free, and valid date-wise
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        userId: userId,
        isActive: true,
        // Status must be active or trialing.
        status: { in: ['active', 'trialing'] },
        OR: [{ endDate: null }, { endDate: { gt: new Date() } }],
        plan: {
          isFree: false,
        },
      },
      include: {
        plan: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!subscription) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message:
          'No active subscription. Start a trial or purchase a plan to continue.',
        redirect: '/subscription',
        trial_available: true,
      });
    }

    // If strict subscription is required (no trial), check status
    if (subscriptionOnly && subscription.status === 'trialing') {
      throw new ForbiddenException({
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'A paid subscription is required to access this resource.',
        redirect: '/subscription',
        trial_active: true,
        trial_ends_at: subscription.trialEndsAt?.toISOString(),
      });
    }

    // Attach subscription info to request for convenience
    request.subscription = subscription;

    return true;
  }
}
