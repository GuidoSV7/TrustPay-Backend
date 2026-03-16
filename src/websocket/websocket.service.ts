import { Injectable } from '@nestjs/common';

interface ConnectedUser {
  userId: string;
  socketId: string;
  isAuthenticated: boolean;
  connectedAt: Date;
}

@Injectable()
export class WebSocketService {
  private connectedUsers: Map<string, ConnectedUser> = new Map();
  private socketToUserId: Map<string, string> = new Map();

  async addUser(userId: string, socketId: string, isAuthenticated: boolean): Promise<void> {
    // Si el usuario ya existe con otro socket, remover el anterior
    const existingUser = Array.from(this.connectedUsers.values()).find(
      (user) => user.userId === userId && user.socketId !== socketId
    );
    
    if (existingUser) {
      this.connectedUsers.delete(existingUser.socketId);
      this.socketToUserId.delete(existingUser.socketId);
    }

    const user: ConnectedUser = {
      userId,
      socketId,
      isAuthenticated,
      connectedAt: new Date(),
    };

    this.connectedUsers.set(socketId, user);
    this.socketToUserId.set(socketId, userId);
  }

  async removeUserBySocketId(socketId: string): Promise<string | null> {
    const user = this.connectedUsers.get(socketId);
    if (user) {
      this.connectedUsers.delete(socketId);
      this.socketToUserId.delete(socketId);
      return user.userId;
    }
    return null;
  }

  async removeUserByUserId(userId: string): Promise<void> {
    const userEntries = Array.from(this.connectedUsers.entries()).filter(
      ([_, user]) => user.userId === userId
    );

    userEntries.forEach(([socketId, _]) => {
      this.connectedUsers.delete(socketId);
      this.socketToUserId.delete(socketId);
    });
  }

  getUsersCount(): number {
    return this.connectedUsers.size;
  }

  getConnectedUsers(): ConnectedUser[] {
    return Array.from(this.connectedUsers.values());
  }

  getUserBySocketId(socketId: string): ConnectedUser | undefined {
    return this.connectedUsers.get(socketId);
  }

  isUserConnected(userId: string): boolean {
    return Array.from(this.connectedUsers.values()).some(
      (user) => user.userId === userId
    );
  }
}

