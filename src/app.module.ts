// external imports
import { MiddlewareConsumer, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
// import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
// import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { RedisModule } from '@nestjs-modules/ioredis';
import { ScheduleModule } from '@nestjs/schedule';

// internal imports
import appConfig from './config/app.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { AuthModule } from './modules/auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
// import { ThrottlerBehindProxyGuard } from './common/guard/throttler-behind-proxy.guard';
import { AbilityModule } from './ability/ability.module';
import { MailModule } from './mail/mail.module';
import { ApplicationModule } from './modules/application/application.module';
import { AdminModule } from './modules/admin/admin.module';
import { ChatModule } from './modules/chat/chat.module';
import { PaymentModule } from './modules/payment/payment.module';
import { HabitModule } from './modules/habit/habit.module';
import { InspirationModule } from './modules/inspiration/inspiration.module';
import { SubscriptionGuard } from './common/guard/subscription/subscription.guard';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { ProfileModule } from './modules/profile/profile.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
    }),
    BullModule.forRoot({
      connection: {
        host: appConfig().redis.host,
        password: appConfig().redis.password,
        port: +appConfig().redis.port,
      },
    }),
    RedisModule.forRoot({
      type: 'single',
      options: {
        host: appConfig().redis.host,
        password: appConfig().redis.password,
        port: +appConfig().redis.port,
      },
    }),
    ScheduleModule.forRoot(),
    // General modules
    PrismaModule,
    AuthModule,
    AbilityModule,
    MailModule,
    ApplicationModule,
    AdminModule,
    ChatModule,
    PaymentModule,
    HabitModule,
    InspirationModule,
    SubscriptionModule,
    ProfileModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: SubscriptionGuard,
    },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
