import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { WebSocketService } from './websocket.service';
import { parseCorsOrigins } from '../config/cors.util';

@WebSocketGateway({
  cors: {
    origin: parseCorsOrigins(process.env.CORS_ORIGIN),
    credentials: true,
  },
  namespace: '/live-users',
})
export class LiveUsersGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(LiveUsersGateway.name);

  constructor(
    private readonly webSocketService: WebSocketService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(User) private userRepository: Repository<User>,
  ) {}

  async handleConnection(@ConnectedSocket() client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      let user: User | null = null;

      if (token) {
        try {
          const payload = this.jwtService.verify(token, {
            secret:
              this.configService.get('JWT_SECRET') || 'trustpay-secret',
          });
          user = await this.userRepository.findOneBy({ id: payload.sub });
          if (user && !user.isActive) {
            client.disconnect();
            return;
          }
        } catch {
          this.logger.warn(`Token inválido: ${client.id}`);
        }
      }

      if (user && user.role === UserRole.ADMIN) {
        client.disconnect();
        return;
      }

      const userId = user ? user.id : `guest_${client.id}`;
      await this.webSocketService.addUser(userId, client.id, !!user);

      client.emit('users-count', this.webSocketService.getUsersCount());
      this.broadcastUsersCount();
    } catch (error: any) {
      this.logger.error(error?.message, error?.stack);
                   client.disconnect();
    }
  }

  async handleDisconnect(@ConnectedSocket() client: Socket) {
    try {
      const removed = await this.webSocketService.removeUserBySocketId(
        client.id,
      );
      if (removed) {
        this.broadcastUsersCount();
      }
    } catch (error: any) {
      this.logger.error(error?.message, error?.stack);
    }
  }

  private broadcastUsersCount() {
    this.server.emit('users-count', this.webSocketService.getUsersCount());
  }
}
