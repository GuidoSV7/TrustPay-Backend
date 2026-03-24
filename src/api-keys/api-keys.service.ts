import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { ApiKey } from './entities/api-key.entity';
import { Business } from '../businesses/entities/business.entity';
import type { CreateApiKeyDto } from './schemas/create-api-key.schema';
import { UserRole } from '../users/entities/user.entity';
import {
  PaginationDto,
  getPaginationParams,
  PaginatedResponse,
  paginated,
} from '../common/dto/pagination.dto';
import type { AdminApiKeySetDisabledDto } from './schemas/admin-api-key.schema';

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);

  constructor(
    @InjectRepository(ApiKey) private readonly repo: Repository<ApiKey>,
    @InjectRepository(Business) private readonly businessRepo: Repository<Business>,
  ) {}

  private async findKeyOrFail(id: string, businessId: string): Promise<ApiKey> {
    const k = await this.repo.findOne({ where: { id, businessId } });
    if (!k) throw new NotFoundException('API key no encontrada');
    return k;
  }

  private async assertBusiness(businessId: string, userId: string, role: string) {
    const b = await this.businessRepo.findOne({ where: { id: businessId } });
    if (!b) throw new NotFoundException('Negocio no encontrado');
    if (role !== UserRole.ADMIN && b.userId !== userId) {
      throw new ForbiddenException('No autorizado');
    }
    if (!b.isActive && role !== UserRole.ADMIN) {
      throw new BadRequestException('El negocio está desactivado');
    }
    return b;
  }

  private generatePublishable(network: string): string {
    const rand = crypto.randomBytes(12).toString('hex');
    return `pk_${network}_${rand}`;
  }

  private generateSecret(network: string): string {
    const rand = crypto.randomBytes(24).toString('hex');
    return `sk_${network}_${rand}`;
  }

  async create(
    businessId: string,
    userId: string,
    role: string,
    dto: CreateApiKeyDto,
  ) {
    await this.assertBusiness(businessId, userId, role);
    const network = dto.network || 'devnet';
    if (!['devnet', 'testnet', 'mainnet'].includes(network)) {
      throw new BadRequestException('network debe ser devnet, testnet o mainnet');
    }
    let publishableKey = this.generatePublishable(network);
    let exists = await this.repo.findOne({ where: { publishableKey } });
    while (exists) {
      publishableKey = this.generatePublishable(network);
      exists = await this.repo.findOne({ where: { publishableKey } });
    }
    const plainSecret = this.generateSecret(network);
    const secretHash = await bcrypt.hash(plainSecret, 10);
    const preview =
      plainSecret.slice(0, 10) + '...' + plainSecret.slice(-6);
    const row = this.repo.create({
      ...dto,
      businessId,
      publishableKey,
      secretKey: secretHash,
      secretKeyPreview: preview.slice(0, 20),
      network,
      revokedAt: null,
      disabledAt: null,
    });
    await this.repo.save(row);
    this.logger.log(`API key creada: ${row.publishableKey} (negocio ${businessId})`);
    return {
      id: row.id,
      publishableKey: row.publishableKey,
      secretKey: plainSecret,
      secretKeyPreview: row.secretKeyPreview,
      network: row.network,
      name: row.name,
      createdAt: row.createdAt,
      message:
        'Guarda el secretKey ahora; no se volverá a mostrar.',
    };
  }

  async findAllByBusiness(
    businessId: string,
    userId: string,
    role: string,
    pagination: PaginationDto,
  ): Promise<
    PaginatedResponse<{
      id: string;
      name: string | null;
      publishableKey: string;
      secretKeyPreview: string | null;
      network: string;
      lastUsedAt: Date | null;
      revokedAt: Date | null;
      disabledAt: Date | null;
      createdAt: Date;
    }>
  > {
    await this.assertBusiness(businessId, userId, role);
    const { page, limit, skip } = getPaginationParams(pagination);
    const [keys, total] = await this.repo.findAndCount({
      where: { businessId },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
    const data = keys.map((k) => ({
      id: k.id,
      name: k.name,
      publishableKey: k.publishableKey,
      secretKeyPreview: k.secretKeyPreview,
      network: k.network,
      lastUsedAt: k.lastUsedAt,
      revokedAt: k.revokedAt,
      disabledAt: k.disabledAt,
      createdAt: k.createdAt,
    }));
    return paginated(data, total, page, limit);
  }

  async revoke(
    id: string,
    businessId: string,
    userId: string,
    role: string,
  ) {
    await this.assertBusiness(businessId, userId, role);
    const k = await this.findKeyOrFail(id, businessId);
    k.revokedAt = new Date();
    await this.repo.save(k);
    this.logger.log(`API key revocada: ${k.publishableKey}`);
    return { revoked: true };
  }

  /** Validar publishable + secret (SDK) */
  async validateKeys(
    publishableKey: string,
    secret: string,
  ): Promise<ApiKey | null> {
    const k = await this.repo.findOne({
      where: { publishableKey },
    });
    if (!k || k.revokedAt || k.disabledAt) return null;
    const ok = await bcrypt.compare(secret, k.secretKey);
    if (!ok) return null;
    k.lastUsedAt = new Date();
    await this.repo.save(k);
    return k;
  }

  /**
   * Listado global para admin: credenciales por negocio / merchant.
   * El secreto completo no se puede recuperar (bcrypt); solo preview.
   */
  async adminFindAll(
    pagination: PaginationDto,
    search?: string,
  ): Promise<
    PaginatedResponse<{
      id: string;
      businessId: string;
      businessName: string;
      merchantUserId: string;
      merchantEmail: string;
      name: string | null;
      publishableKey: string;
      secretKeyPreview: string | null;
      /** El valor sk_* completo no está almacenado en claro (solo hash). */
      secretKeyFullAvailable: false;
      secretKeyNote: string;
      network: string;
      lastUsedAt: Date | null;
      revokedAt: Date | null;
      disabledAt: Date | null;
      createdAt: Date;
    }>
  > {
    const { page, limit, skip } = getPaginationParams(pagination);
    const qb = this.repo
      .createQueryBuilder('k')
      .innerJoinAndSelect('k.business', 'b')
      .innerJoinAndSelect('b.user', 'u')
      .orderBy('k.createdAt', 'DESC');

    if (search?.trim()) {
      const s = `%${search.trim()}%`;
      qb.andWhere('(u.email ILIKE :s OR b.name ILIKE :s OR k.publishable_key ILIKE :s)', {
        s,
      });
    }

    const [rows, total] = await qb.skip(skip).take(limit).getManyAndCount();

    const secretNote =
      'El secret completo (sk_*) solo se mostró una vez al crear la clave; en BD se guarda como hash bcrypt.';

    const data = rows.map((k) => ({
      id: k.id,
      businessId: k.businessId,
      businessName: k.business?.name ?? '',
      merchantUserId: k.business?.userId ?? '',
      merchantEmail: k.business?.user?.email ?? '',
      name: k.name,
      publishableKey: k.publishableKey,
      secretKeyPreview: k.secretKeyPreview,
      secretKeyFullAvailable: false as const,
      secretKeyNote: secretNote,
      network: k.network,
      lastUsedAt: k.lastUsedAt,
      revokedAt: k.revokedAt,
      disabledAt: k.disabledAt,
      createdAt: k.createdAt,
    }));

    return paginated(data, total, page, limit);
  }

  /** Deshabilitar o reactivar API key (solo admin). */
  async adminSetDisabled(
    id: string,
    dto: AdminApiKeySetDisabledDto,
  ): Promise<{
    id: string;
    disabled: boolean;
    disabledAt: string | null;
  }> {
    const k = await this.repo.findOne({
      where: { id },
      relations: ['business', 'business.user'],
    });
    if (!k) throw new NotFoundException('API key no encontrada');
    if (k.revokedAt) {
      throw new BadRequestException(
        'Esta clave está revocada; no se puede activar/desactivar por admin',
      );
    }
    k.disabledAt = dto.disabled ? new Date() : null;
    await this.repo.save(k);
    this.logger.log(
      `API key ${id} admin disabled=${dto.disabled} | publishable=${k.publishableKey}`,
    );
    return {
      id: k.id,
      disabled: !!k.disabledAt,
      disabledAt: k.disabledAt?.toISOString() ?? null,
    };
  }
}
