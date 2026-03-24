import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
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
import { SolanaService } from '../solana/solana.service';

@Injectable()
export class BusinessesService {
  private readonly logger = new Logger(BusinessesService.name);

  constructor(
    @InjectRepository(Business)
    private readonly repo: Repository<Business>,
    private readonly solana: SolanaService,
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
    // Generamos el UUID antes de persistir para usarlo como puente con la blockchain
    const businessId = randomUUID();

    // La blockchain es la fuente de verdad: primero registramos on-chain.
    // Si la transacción falla, la excepción se propaga y nada se guarda en BD.
    const solanaTxRegister = await this.solana.registrarNegocio(
      businessId,
      dto.walletAddress,
    );

    const b = this.repo.create({
      ...dto,
      id: businessId,
      userId,
      isActive: true,
      isVerified: false,
      solanaTxRegister,
      solanaTxVerify: null,
    });
    const saved = await this.repo.save(b);
    this.logger.log(
      `Negocio creado: ${saved.id} | tx: ${solanaTxRegister} | usuario: ${userId}`,
    );
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
      qb.where('b.userId = :userId', { userId }).andWhere('b.isActive = :active', {
        active: true,
      });
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

    if (dto.isActive !== undefined && role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Solo administradores pueden cambiar el estado activo del negocio',
      );
    }

    if (!b.isActive && role !== UserRole.ADMIN) {
      throw new BadRequestException(
        'El negocio está desactivado. Contacta al administrador si necesitás reactivarlo.',
      );
    }

    const { isActive, ...rest } = dto;
    Object.assign(b, rest);
    if (isActive !== undefined) {
      b.isActive = isActive;
    }

    const saved = await this.repo.save(b);
    return this.toResponse(saved);
  }

  /** Soft delete: marca isActive = false (no borra fila ni datos on-chain). */
  async remove(id: string, userId: string, role: string): Promise<BusinessResponseDto> {
    const b = await this.findBusinessOrFail(id);
    if (role !== UserRole.ADMIN && b.userId !== userId) {
      throw new ForbiddenException('No autorizado');
    }
    if (!b.isActive) {
      return this.toResponse(b);
    }
    b.isActive = false;
    const saved = await this.repo.save(b);
    this.logger.log(`Negocio desactivado (soft delete): ${id}`);
    return this.toResponse(saved);
  }

  /**
   * Marca el negocio como verificado on-chain y en BD.
   * Solo admins pueden llamar este método.
   * La tx on-chain va primero; si falla, la BD no se toca.
   */
  async verify(id: string, userId: string, role: string): Promise<BusinessResponseDto> {
    if (role !== UserRole.ADMIN) {
      throw new ForbiddenException('Solo administradores pueden verificar negocios');
    }

    const b = await this.findBusinessOrFail(id);

    // Primero verificamos on-chain; si lanza excepción, la BD no cambia
    const solanaTxVerify = await this.solana.verificarNegocio(
      b.walletAddress,
      b.id,
    );

    b.isVerified = true;
    b.solanaTxVerify = solanaTxVerify;
    const saved = await this.repo.save(b);

    this.logger.log(
      `Negocio verificado: ${id} | tx: ${solanaTxVerify}`,
    );
    return this.toResponse(saved);
  }
}
