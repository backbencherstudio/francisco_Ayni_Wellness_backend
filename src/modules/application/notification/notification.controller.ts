import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { NotificationService } from './notification.service';
import { GetUser } from '../../auth/decorators/get-user.decorator';

@ApiBearerAuth()
@ApiTags('Notification')
@UseGuards(JwtAuthGuard)
@Controller('notification')
export class AppNotificationController {
  constructor(private service: NotificationService) {}

  @ApiOperation({ summary: 'List notifications for current user' })
  @Get()
  async list(@GetUser() user) {
    return this.service.listForUser(user.userId);
  }

  @ApiOperation({ summary: 'Unread count' })
  @Get('unread-count')
  async unread(@GetUser() user) {
    return this.service.unreadCount(user.userId);
  }

  @ApiOperation({ summary: 'Create and dispatch a notification to a user' })
  @Post()
  async create(@GetUser() user, @Body() body: { receiver_id: string; text: string; type?: string; entity_id?: string }) {
    return this.service.createAndDispatch({
      sender_id: user.userId,
      receiver_id: body.receiver_id,
      text: body.text,
      type: (body.type as any) || undefined,
      entity_id: body.entity_id,
    });
  }

  @ApiOperation({ summary: 'Mark a notification as read' })
  @Post(':id/read')
  async markRead(@GetUser() user, @Param('id') id: string) {
    return this.service.markRead(id, user.userId);
  }

  @ApiOperation({ summary: 'Mark all notifications as read' })
  @Post('read-all')
  async markAllRead(@GetUser() user) {
    return this.service.markAllRead(user.userId);
  }

  @ApiOperation({ summary: 'Delete a notification' })
  @Delete(':id')
  async remove(@GetUser() user, @Param('id') id: string) {
    return this.service.remove(id, user.userId);
  }

  @ApiOperation({ summary: 'Delete all notifications for current user' })
  @Delete()
  async removeAll(@GetUser() user) {
    return this.service.removeAll(user.userId);
  }
}
