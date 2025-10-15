import { MessageStatus } from '@prisma/client';
import prisma from '../../../prisma/prisma.singleton';

export class ChatRepository {
  /**
   * Update message status
   * @returns
   */
  static async updateMessageStatus(message_id: string, status: MessageStatus) {
    // if message exist
    const message = await prisma.message.findFirst({
      where: {
        id: message_id,
      },
    });

    if (!message) {
      return;
    }

    await prisma.message.update({
      where: {
        id: message_id,
      },
      data: {
        status,
      },
    });
  }

  /**
   * Update user status
   * @returns
   */
  static async updateUserStatus(user_id: string, status: string) {
    // if user exist
    const user = await prisma.user.findFirst({
      where: {
        id: user_id,
      },
    });

    if (!user) {
      return;
    }
    return await prisma.user.update({
      where: { id: user_id },
      data: {
        availability: status,
      },
    });
  }
}
