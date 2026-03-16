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
    if (!k || k.revokedAt) return null;
    const ok = await bcrypt.compare(secret, k.secretKey);
    if (!ok) return null;
    k.lastUsedAt = new Date();
    await this.repo.save(k);
    return k;
  }
}
