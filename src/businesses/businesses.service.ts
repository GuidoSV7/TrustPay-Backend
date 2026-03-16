import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business } from './entities/business.entity';
import type { CreateBusinessDto } from './schemas/create-business.schema';
import type { UpdateBusinessDto } from './schemas/update-business.schema';
import { BusinessResponseDto } from './dto/business-response.dto';
import { UserRole } from '../users/entities/user.entity';
import {
  PaginationDto,
  getPaginationParams,
  PaginatedResponse,
  paginated,
} from '../common/dto/pagination.dto';

@Injectable()
export class BusinessesService {
  private readonly logger = new Logger(BusinessesService.name);

  constructor(
    @InjectRepository(Business)
    private readonly repo: Repository<Business>,
  ) {}

  private async findBusinessOrFail(id: string): Promise<Business> {
    const b = await this.repo.findOne({ where: { id } });
    if (!b) throw new NotFoundException('Negocio no encontrado');
    return b;
  }

  private toResponse(b: Business): BusinessResponseDto {
    return { ...b };
  }

  async create(userId: string, dto: CreateBusinessDto): Promise<BusinessResponseDto> {
    const b = this.repo.create({
      ...dto,
      userId,
      isActive: true,
    });
    const saved = await this.repo.save(b);
    this.logger.log(`Negocio creado: ${saved.id} (usuario ${userId})`);
    return this.toResponse(saved);
  }

  async findAllForUser(
    userId: string,
    role: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResponse<BusinessResponseDto>> {
    const { page, limit, skip } = getPaginationParams(pagination);
    const qb = this.repo
      .createQueryBuilder('b')
      .orderBy('b.createdAt', 'DESC')
      .skip(skip)
      .take(limit);
    if (role !== UserRole.ADMIN) {
      qb.where('b.userId = :userId', { userId });
    }
    const [items, total] = await qb.getManyAndCount();
    const data = items.map((b) => this.toResponse(b));
    return paginated(data, total, page, limit);
  }

  async findOne(id: string, userId: string, role: string): Promise<BusinessResponseDto> {
    const b = await this.findBusinessOrFail(id);
    if (role !== UserRole.ADMIN && b.userId !== userId) {
      throw new ForbiddenException('No autorizado');
    }
    return this.toResponse(b);
  }

  async update(
    id: string,
    userId: string,
    role: string,
    dto: UpdateBusinessDto,
  ): Promise<BusinessResponseDto> {
    const b = await this.findBusinessOrFail(id);
    if (role !== UserRole.ADMIN && b.userId !== userId) {
      throw new ForbiddenException('No autorizado');
    }
    Object.assign(b, dto);
    const saved = await this.repo.save(b);
    return this.toResponse(saved);
  }

  async remove(id: string, userId: string, role: string) {
    const b = await this.findBusinessOrFail(id);
    if (role !== UserRole.ADMIN && b.userId !== userId) {
      throw new ForbiddenException('No autorizado');
    }
    await this.repo.remove(b);
    this.logger.log(`Negocio eliminado: ${id}`);
    return { deleted: true };
  }
}
