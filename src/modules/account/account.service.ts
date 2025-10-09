import { Injectable } from '@nestjs/common';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { ContactSupportDto } from './dto/contact-support.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import appConfig from '../../config/app.config';

@Injectable()
export class AccountService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  async contactSupport(userId: string, dto: ContactSupportDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) return { success: false, message: 'User not found' };
    const ticket = await this.prisma.supportTicket.create({
      data: {
        user_id: user.id,
        email: dto.email || user.email,
        description: dto.description.trim(),
      },
    });
    const ownerEmail =
      process.env.SUPPORT_OWNER_EMAIL ||
      process.env.SYSTEM_EMAIL ||
      'support@ayni.com';
    // fire-and-forget email, but await for reliability
    try {
      await this.mail.sendSupportEmail({
        to: ownerEmail,
        userName: user.name || user.email,
        userEmail: user.email,
        description: dto.description,
        ticketId: ticket.id,
        submittedAt: ticket.created_at,
        dashboardUrl: `${appConfig().app.client_app_url}/admin/support/${ticket.id}`,
      });
    } catch (e) {
      // do not fail the request if email sending fails
      console.warn('Support email failed:', e?.message || e);
    }
    return {
      success: true,
      message: 'Support request submitted',
      ticket_id: ticket.id,
    };
  }

  // --- scaffolds (unchanged) ---
  create(createAccountDto: CreateAccountDto) {
    return { success: false, message: 'Not implemented' };
  }

  async listSupportTickets(userId: string) {
    const tickets = await this.prisma.supportTicket.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        created_at: true,
        status: true,
        description: true,
        resolved_at: true,
      },
    });
    return { success: true, tickets };
  }

  async getSupportTicket(userId: string, ticketId: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, user_id: userId },
      select: {
        id: true,
        created_at: true,
        updated_at: true,
        status: true,
        description: true,
        resolved_at: true,
      },
    });
    if (!ticket) return { success: false, message: 'Not found' };
    return { success: true, ticket };
  }

  async updateSupportTicketStatus(
    userId: string,
    ticketId: string,
    status: 'OPEN' | 'CLOSED' | 'RESOLVED',
  ) {
    const existing = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, user_id: userId },
    });
    if (!existing) return { success: false, message: 'Not found' };
    const updated = await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status, resolved_at: status === 'RESOLVED' ? new Date() : null },
      select: { id: true, status: true, resolved_at: true },
    });
    return { success: true, ticket: updated };
  }

  async sendFeedback(userId: string, dto: { feedback: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) return { success: false, message: 'User not found' };
    const ownerEmail =
      process.env.FEEDBACK_OWNER_EMAIL ||
      process.env.SYSTEM_EMAIL ||
      'feedback@ayni.com';
    // fire-and-forget email, but await for reliability
    try {
      await this.mail.sendFeedbackEmail({
        to: ownerEmail,
        userName: user.name || user.email,
        userEmail: user.email,
        feedback: dto.feedback,
      });
    } catch (e) {
      // do not fail the request if email sending fails
      console.warn('Feedback email failed:', e?.message || e);
    }
    return { success: true, message: 'Feedback submitted' };
  }

  async deleteAccount(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) return { success: false, message: 'User not found' };
    if (user.email && user.email.startsWith('deleted_')) {
      return { success: true, message: 'Account already deleted' };
    }

    const surrogate = `deleted_${userId.substring(0, 8)}_${Date.now()}@deleted.local`;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        email: surrogate,
        name: null,
        avatar: null,
      },
    });

    // TODO: revoke auth tokens / sessions / subscriptions if implemented
    
    return { success: true, message: 'Account deleted' };
  }
}
