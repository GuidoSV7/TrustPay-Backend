import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { users } from './data/users';
import * as bcrypt from 'bcrypt';

@Injectable()
export class SeederService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
  ) {}

  async onModuleInit() {}

  async seed() {
    await this.seedUsers();
    console.log('✓ Usuarios TrustPay creados');
  }

  private async seedUsers() {
    for (const seedUser of users) {
      const existingUser = await this.userRepository.findOne({
        where: { email: seedUser.email },
      });
      if (existingUser) {
        console.log(`  - Ya existe: ${seedUser.email}`);
        continue;
      }
      const user = this.userRepository.create({
        email: seedUser.email.toLowerCase(),
        password: await bcrypt.hash(seedUser.password, 10),
        fullName: seedUser.fullName,
        role: seedUser.role,
        country: seedUser.country,
        isActive: true,
        isVerified: true,
      });
      await this.userRepository.save(user);
      console.log(`  - Creado: ${user.email} (${user.role})`);
    }
  }
}
