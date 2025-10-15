import { MailerModule } from '@nestjs-modules/mailer';
import { Global, Module } from '@nestjs/common';
import { existsSync } from 'fs';
import { EjsAdapter } from '@nestjs-modules/mailer/dist/adapters/ejs.adapter';
import { MailService } from './mail.service';
import appConfig from '../config/app.config';
import { BullModule } from '@nestjs/bullmq';
import { MailProcessor } from './processors/mail.processor';

@Global()
@Module({
  imports: [
    MailerModule.forRoot({
      // transport: 'smtps://user@example.com:topsecret@smtp.example.com',
      // or
      transport: {
        host: appConfig().mail.host,
        port: +appConfig().mail.port,
        secure: false,
        auth: {
          user: appConfig().mail.user,
          pass: appConfig().mail.password,
        },
      },
      defaults: {
        from: appConfig().mail.from,
      },
      template: {
        dir: (() => {
          const distPath = process.cwd() + '/dist/mail/templates/';
          const srcPath = process.cwd() + '/src/mail/templates/';
          const isProd = process.env.NODE_ENV === 'production';
          if (isProd) return distPath;
          return existsSync(srcPath) ? srcPath : distPath; // dev: prefer src for live reload
        })(),
        adapter: new EjsAdapter(),
        options: {},
      },
    }),
    BullModule.registerQueue({
      name: 'mail-queue',
    }),
  ],
  providers: [MailService, MailProcessor],
  exports: [MailService],
})
export class MailModule {}
