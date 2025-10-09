// external imports
import { Logger, Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import prismaSingleton from './prisma.singleton';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  // expose the prisma client instance
  public readonly $: typeof prismaSingleton = prismaSingleton as any;
  // For backwards compatibility where code expects 'this' to be a PrismaClient
  // we proxy selected methods
  get user() { return prismaSingleton.user; }
  get role() { return prismaSingleton.role; }
  get paymentTransaction() { return prismaSingleton.paymentTransaction; }
  get subscription() { return prismaSingleton.subscription; }
  // Add other frequently used models as needed or fallback via [key]
  [key: string]: any;

  constructor() {
    // Fallback proxy for any model not explicitly added
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (Reflect.has(target, prop)) return Reflect.get(target, prop, receiver);
        const val = (prismaSingleton as any)[prop as any];
        if (typeof val === 'function') return val.bind(prismaSingleton);
        return val;
      },
    });
  }

  async onModuleInit() {
    await prismaSingleton.$connect();
  }

  async onModuleDestroy() {
    await prismaSingleton.$disconnect();
  }
}
