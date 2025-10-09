import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { MailerService } from '@nestjs-modules/mailer';
import appConfig from '../config/app.config';

@Injectable()
export class MailService {
  constructor(
    @InjectQueue('mail-queue') private queue: Queue,
    private mailerService: MailerService,
  ) {}

  async sendMemberInvitation({ user, member, url }) {
    try {
      const from = `${process.env.APP_NAME} <${appConfig().mail.from}>`;
      const subject = `${user.fname} is inviting you to ${appConfig().app.name}`;

      // add to queue
      await this.queue.add('sendMemberInvitation', {
        to: member.email,
        from: from,
        subject: subject,
        template: 'member-invitation.ejs',
        context: {
          user: user,
          member: member,
          url: url,
        },
      });
    } catch (error) {
      console.log(error);
    }
  }

  // send otp code for email verification
  async sendOtpCodeToEmail({ name, email, otp }) {
    try {
      const from = `${process.env.APP_NAME} <${appConfig().mail.from}>`;
      const subject = 'Email Verification';

      // add to queue
      await this.queue.add('sendOtpCodeToEmail', {
        to: email,
        from: from,
        subject: subject,
        template: 'email-verification.ejs',
        context: {
          name: name,
          otp: otp,
        },
      });
    } catch (error) {
      console.log(error);
    }
  }

  async sendVerificationLink(params: {
    email: string;
    name: string;
    token: string;
    type: string;
  }) {
    try {
      const verificationLink = `${appConfig().app.client_app_url}/verify-email?token=${params.token}&email=${params.email}&type=${params.type}`;

      // add to queue
      await this.queue.add('sendVerificationLink', {
        to: params.email,
        subject: 'Verify Your Email',
        template: 'verification-link.ejs',
        context: {
          name: params.name,
          verificationLink,
        },
      });
    } catch (error) {
      console.log(error);
    }
  }

  async sendSupportEmail(params: { to: string; userName: string; userEmail?: string; description: string; ticketId: string; submittedAt?: Date; dashboardUrl?: string }) {
    try {
      const subject = `Support Request #${params.ticketId}`;
      const submittedAt = params.submittedAt || new Date();
      await this.queue.add('sendSupportEmail', {
        to: params.to,
        subject,
        template: 'support-request.ejs',
        context: {
          appName: appConfig().app.name,
          userName: params.userName,
            userEmail: params.userEmail,
          description: params.description,
          ticketId: params.ticketId,
          submittedAt: submittedAt.toISOString(),
          dashboardUrl: params.dashboardUrl,
        },
      });
    } catch (error) {
      console.log(error);
    }
  }

  async sendFeedbackEmail(params: { to: string; userName: string; userEmail: string; feedback: string }) {
    try {
      const subject = `Feedback from ${params.userName}`;
      await this.queue.add('sendFeedbackEmail', {
        to: params.to,
        subject,
        template: 'feedback.ejs',
        context: {
          appName: appConfig().app.name,
          userName: params.userName,
          userEmail: params.userEmail,
          feedback: params.feedback,
        },
      });
    } catch (error) {
      console.log(error);
    }
  }

}
