import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { UserProfileDto } from './dto/user-profile.dto';
import { CompleteUserDto } from './dto/complete-user.dto';
import type { UpdateUserDto } from './schemas/update-user.schema';
import type { UpdateUserAdminDto } from './schemas/update-user-admin.schema';
import {
  PaginatedResponse,
  paginated,
  getPaginationParams,
  PaginationDto,
} from '../common/dto/pagination.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  private async findOrFail(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`Usuario ${id} no encontrado`);
    return user;
  }

  async getUserProfile(userId: string): Promise<UserProfileDto> {
    const user = await this.findOrFail(userId);
    return { ...user };
  }

  async findAllComplete(
    pagination: PaginationDto,
    search?: string,
    includeInactive = true,
    role?: UserRole,
  ): Promise<PaginatedResponse<CompleteUserDto>> {
    const { page, limit, skip } = getPaginationParams(pagination);
    const isActiveFilter = includeInactive ? {} : { isActive: true };
    const roleFilter = role ? { role } : {};
    const baseWhere = { ...isActiveFilter, ...roleFilter };
    const [users, total] = await this.userRepository.findAndCount({
      where: search
        ? [
            { fullName: ILike(`%${search}%`), ...baseWhere },
            { email: ILike(`%${search}%`), ...baseWhere },
          ]
        : baseWhere,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
    const data: CompleteUserDto[] = users.map((u) => ({ ...u }));
    return paginated(data, total, page, limit);
  }

  async findOneComplete(id: string): Promise<CompleteUserDto> {
    const user = await this.findOrFail(id);
    return { ...user };
  }

  async update(id: string, dto: UpdateUserDto | UpdateUserAdminDto) {
    const user = await this.findOrFail(id);
    Object.assign(user, dto);
    await this.userRepository.save(user);
    return this.findOneComplete(id);
  }

  /** Admin: activar/desactivar cuenta */
  async toggleActive(id: string) {
    const user = await this.findOrFail(id);
    user.isActive = !user.isActive;
    await this.userRepository.save(user);
    return this.findOneComplete(id);
  }

  async deactivate(id: string, password: string) {
    const user = await this.userRepository.findOne({
      where: { id },
      select: { id: true, password: true },
    });
    if (!user) throw new NotFoundException(`Usuario ${id} no encontrado`);
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) throw new UnauthorizedException('Contraseña incorrecta');
    await this.userRepository.update(id, { isActive: false });
    return { message: 'Cuenta desactivada' };
  }
}
