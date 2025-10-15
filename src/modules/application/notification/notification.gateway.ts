import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { NotificationService } from './notification.service';
import appConfig from '../../../config/app.config';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class NotificationGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit
{
  @WebSocketServer()
  server: Server;

  private redisPubClient: Redis;
  private redisSubClient: Redis;

  // Map to store connected clients
  private clients = new Map<string, string>(); // userId -> socketId

  constructor(private readonly notificationService: NotificationService) {}

  onModuleInit() {
    this.redisPubClient = new Redis({
      host: appConfig().redis.host,
      port: Number(appConfig().redis.port),
      password: appConfig().redis.password,
    });

    this.redisSubClient = new Redis({
      host: appConfig().redis.host,
      port: Number(appConfig().redis.port),
      password: appConfig().redis.password,
    });

    this.redisSubClient.subscribe('notification');
    this.redisSubClient.on('message', (channel, message) => {
      if (channel !== 'notification') return;
      try {
        const data = JSON.parse(message);
        const targetSocketId = this.clients.get(data.receiver_id);
        if (targetSocketId) {
          this.server.to(targetSocketId).emit('receiveNotification', data);
        }
      } catch (e) {
        console.error('Failed to parse notification message', e);
      }
    });
  }

  afterInit(server: Server) {
    console.log('Websocket server started');
  }

  async handleConnection(client: Socket, ...args: any[]) {
    // console.log('new connection!', client.id);
    const userId = client.handshake.query.userId as string; // User ID passed as query parameter
    if (userId) {
      this.clients.set(userId, client.id);
      console.log(`User ${userId} connected with socket ${client.id}`);
    }
  }

  handleDisconnect(client: Socket) {
    // console.log('client disconnected!', client.id);
    const userId = [...this.clients.entries()].find(
      ([, socketId]) => socketId === client.id,
    )?.[0];
    if (userId) {
      this.clients.delete(userId);
      console.log(`User ${userId} disconnected`);
    }
  }

  // @SubscribeMessage('joinRoom')
  // handleRoomJoin(client: Socket, room: string) {
  //   client.join(room);
  //   client.emit('joinedRoom', room);
  // }

  @SubscribeMessage('sendNotification')
  async handleNotification(@MessageBody() data: any) {
    console.log(`Received notification: ${JSON.stringify(data)}`);
    const targetSocketId = this.clients.get(data.userId || data.receiver_id);
    if (targetSocketId) {
      await this.redisPubClient.publish('notification', JSON.stringify(data));
    } else {
      // console.log(`User ${data.userId} not connected`);
    }
  }

  // Socket-side CRUD handlers removed; use REST endpoints instead.
}
