import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationRepository } from '../../../common/repository/notification/notification.repository';
import Redis from 'ioredis';
import appConfig from '../../../config/app.config';

export type NotificationType =
  | 'message'
  | 'comment'
  | 'review'
  | 'booking'
  | 'payment_transaction'
  | 'package'
  | 'blog';

interface CreateAndDispatchInput {
  sender_id?: string;
  receiver_id?: string | null;
  text: string;
  type?: NotificationType;
  entity_id?: string;
}

@Injectable()
export class NotificationService {
  private pub: Redis;

  constructor(private prisma: PrismaService) {
    this.pub = new Redis({
      host: appConfig().redis.host,
      port: Number(appConfig().redis.port),
      password: appConfig().redis.password,
    });
  }

  async createAndDispatch(input: CreateAndDispatchInput) {
    const n = await NotificationRepository.createNotification({
      sender_id: input.sender_id,
      receiver_id: input.receiver_id,
      text: input.text,
      type: input.type,
      entity_id: input.entity_id,
    });
    const payload = {
      id: n.id,
      receiver_id: n.receiver_id ?? null,
      sender_id: input.sender_id ?? null,
      text: input.text,
      type: input.type,
      entity_id: input.entity_id ?? null,
      created_at: new Date().toISOString(),
    };
    await this.pub.publish('notification', JSON.stringify(payload));
    return { success: true, data: n };
  }

  async listForUser(userId: string) {
    const items = await this.prisma.notification.findMany({
      where: {
        OR: [{ receiver_id: userId }, { receiver_id: null }],
      },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        created_at: true,
        read_at: true,
        receiver_id: true,
        sender_id: true,
        entity_id: true,
        notification_event: {
          select: { id: true, type: true, text: true },
        },
      },
    });
    const unread = items.filter((i) => !i.read_at).length;
    return { success: true, unread, data: items };
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { receiver_id: userId, read_at: null },
    });
    return { success: true, unread: count };
  }

  async markRead(id: string, userId: string) {
    const updated = await this.prisma.notification.updateMany({
      where: { id, OR: [{ receiver_id: userId }, { receiver_id: null }] },
      data: { read_at: new Date() },
    });
    return {
      success: updated.count > 0,
      message: updated.count > 0 ? 'Marked as read' : 'Not found',
    };
  }

  async markAllRead(userId: string) {
    const res = await this.prisma.notification.updateMany({
      where: { OR: [{ receiver_id: userId }, { receiver_id: null }] },
      data: { read_at: new Date() },
    });
    return { success: true, updated: res.count };
  }

  async remove(id: string, userId: string) {
    const del = await this.prisma.notification.deleteMany({
      where: { id, OR: [{ receiver_id: userId }, { receiver_id: null }] },
    });
    return {
      success: del.count > 0,
      message: del.count > 0 ? 'Deleted' : 'Not found',
    };
  }

  async removeAll(userId: string) {
    const del = await this.prisma.notification.deleteMany({
      where: { OR: [{ receiver_id: userId }, { receiver_id: null }] },
    });
    return { success: true, deleted: del.count };
  }
}
