import prisma from '../../../prisma/prisma.singleton';

export class NotificationRepository {
  /**
   * Create a notification
   * @param sender_id - The ID of the user who fired the event
   * @param receiver_id - The ID of the user to notify
   * @param text - The text of the notification
   * @param type - The type of the notification
   * @param entity_id - The ID of the entity related to the notification
   * @returns The created notification
   */
  static async createNotification({
    sender_id,
    receiver_id,
    text,
    type,
    entity_id,
  }: {
    sender_id?: string;
    receiver_id?: string;
    text?: string;
    type?:
      | 'message'
      | 'comment'
      | 'review'
      | 'booking'
      | 'payment_transaction'
      | 'package'
      | 'blog';
    entity_id?: string;
  }) {
    // If a receiver_id was provided, ensure the user exists. If not, treat as broadcast (null receiver).
    let finalReceiverId = null;
    if (receiver_id) {
      const user = await prisma.user.findUnique({ where: { id: receiver_id } });
      if (user) {
        finalReceiverId = receiver_id;
      } else {
        // invalid receiver id provided; log and continue creating a broadcast notification
        finalReceiverId = null;
      }
    }

    // Build payloads
    const eventData: any = {};
    if (type) eventData.type = type;
    if (text) eventData.text = text;

    const notificationData: any = {
      notification_event: {
        create: eventData,
      },
    };

    // For nested writes Prisma expects relation objects (connect) rather than raw foreign keys
    if (sender_id) notificationData.sender = { connect: { id: sender_id } };
    if (finalReceiverId) notificationData.receiver = { connect: { id: finalReceiverId } };
    if (entity_id) notificationData.entity_id = entity_id;

    // Create both event and notification in a transaction so we don't leave orphaned events
    const created = await prisma.$transaction(async (tx) => {
      const createdNotification = await tx.notification.create({
        data: notificationData,
        include: { notification_event: true },
      });
      return createdNotification;
    });

    return created;
  }
}
