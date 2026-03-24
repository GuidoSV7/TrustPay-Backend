import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../users/entities/user.entity';
import type { LoginDto } from './schemas/login.schema';
import type { RegisterDto } from './schemas/register.schema';
import { solanaAddressesEqual } from '../common/utils/solana-address.util';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private userRepository: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    const { email, password, walletAddress: loginWallet } = loginDto;
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.userRepository.findOne({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        password: true,
        isActive: true,
        role: true,
        fullName: true,
        country: true,
        walletAddress: true,
        isVerified: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.isActive) {
      throw new UnauthorizedException(
        'Esta cuenta ha sido desactivada. Contacta al administrador.',
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (user.role !== UserRole.ADMIN) {
      if (!user.walletAddress) {
        throw new UnauthorizedException(
          'Tu cuenta no tiene una wallet asociada. Contacta al administrador.',
        );
      }
      if (!loginWallet) {
        throw new UnauthorizedException(
          'La wallet Solana es obligatoria para iniciar sesión.',
        );
      }
      if (!solanaAddressesEqual(user.walletAddress, loginWallet)) {
        throw new UnauthorizedException(
          'La wallet no coincide con la registrada en tu cuenta.',
        );
      }
    }

    const payload = { sub: user.id, email: user.email, role: user.role };
    const token = this.jwtService.sign(payload);

    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        country: user.country,
        walletAddress: user.walletAddress,
        isVerified: user.isVerified,
      },
      token,
    };
  }

  async register(registerDto: RegisterDto) {
    const { password, ...userDetails } = registerDto;
    const normalizedEmail = userDetails.email.toLowerCase().trim();

    const existingUser = await this.userRepository.findOneBy({
      email: normalizedEmail,
    });
    if (existingUser) {
      if (!existingUser.isActive) {
        throw new ConflictException(
          'Este correo está asociado a una cuenta desactivada.',
        );
      }
      throw new ConflictException('El correo ya está registrado');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = this.userRepository.create({
      ...userDetails,
      email: normalizedEmail,
      password: hashedPassword,
      fullName: userDetails.fullName ?? null,
      country: userDetails.country ?? 'Bolivia',
      role: UserRole.MERCHANT,
      isActive: true,
      isVerified: true,
    });
    await this.userRepository.save(user);

    const payload = { sub: user.id, email: user.email, role: user.role };
    const token = this.jwtService.sign(payload);

    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        country: user.country,
        walletAddress: user.walletAddress,
        isVerified: user.isVerified,
      },
      token,
    };
  }

  async getProfile(user: User) {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      country: user.country,
      walletAddress: user.walletAddress,
      isVerified: user.isVerified,
      isActive: user.isActive,
    };
  }

  async changePassword(
    user: User,
    currentPassword: string,
    newPassword: string,
  ) {
    const userWithPassword = await this.userRepository.findOne({
      where: { id: user.id },
      select: { id: true, password: true },
    });
    if (!userWithPassword) {
      throw new UnauthorizedException('Usuario no encontrado');
    }
    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      userWithPassword.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Contraseña actual incorrecta');
    }
    if (newPassword.length < 6) {
      throw new BadRequestException(
        'La nueva contraseña debe tener al menos 6 caracteres',
      );
    }
    userWithPassword.password = await bcrypt.hash(newPassword, 10);
    await this.userRepository.save(userWithPassword);
    return { message: 'Contraseña actualizada' };
  }

  async verifyPassword(user: User, password: string) {
    const userWithPassword = await this.userRepository.findOne({
      where: { id: user.id },
      select: { id: true, password: true },
    });
    if (!userWithPassword) {
      throw new UnauthorizedException('Usuario no encontrado');
    }
    const ok = await bcrypt.compare(password, userWithPassword.password);
    if (!ok) throw new UnauthorizedException('Contraseña incorrecta');
    return { verified: true };
  }
}
