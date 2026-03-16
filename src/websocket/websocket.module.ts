import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LiveUsersGateway } from './websocket.gateway';
import { WebSocketService } from './websocket.service';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET') || 'trustpay-secret',
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [LiveUsersGateway, WebSocketService],
  exports: [WebSocketService],
})
export class WebSocketModule {}
