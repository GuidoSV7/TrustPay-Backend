import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { WebhookEndpoint } from './entities/webhook-endpoint.entity';
import { WebhookSubscription } from './entities/webhook-subscription.entity';
import { Business } from '../businesses/entities/business.entity';
import type { CreateWebhookEndpointDto } from './schemas/create-webhook-endpoint.schema';
import type { UpdateWebhookEndpointDto } from './schemas/update-webhook-endpoint.schema';
import { WebhookEndpointResponseDto } from './dto/webhook-endpoint-response.dto';
import { UserRole } from '../users/entities/user.entity';
import {
  PaginationDto,
  getPaginationParams,
  PaginatedResponse,
  paginated,
} from '../common/dto/pagination.dto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectRepository(WebhookEndpoint)
    private readonly endpointRepo: Repository<WebhookEndpoint>,
    @InjectRepository(WebhookSubscription)
    private readonly subRepo: Repository<WebhookSubscription>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
  ) {}

  private async findEndpointOrFail(
    id: string,
    businessId: string,
  ): Promise<WebhookEndpoint> {
    const ep = await this.endpointRepo.findOne({
      where: { id, businessId },
    });
    if (!ep) throw new NotFoundException('Endpoint no encontrado');
    return ep;
  }

  async assertBusinessAccess(
    businessId: string,
    userId: string,
    role: string,
  ) {
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

  async createEndpoint(
    businessId: string,
    userId: string,
    role: string,
    dto: CreateWebhookEndpointDto,
  ) {
    await this.assertBusinessAccess(businessId, userId, role);
    const secret = crypto.randomBytes(32).toString('base64url');
    const ep = this.endpointRepo.create({
      ...dto,
      businessId,
      secretHash: secret,
      isActive: true,
    });
    await this.endpointRepo.save(ep);
    this.logger.log(`Webhook endpoint creado: ${ep.id} (negocio ${businessId})`);
    return {
      id: ep.id,
      url: ep.url,
      isActive: ep.isActive,
      signingSecret: secret,
      message:
        'Guarda signingSecret para verificar firma HMAC (header X-TrustPay-Signature); no se vuelve a mostrar.',
    };
  }

  async listEndpoints(
    businessId: string,
    userId: string,
    role: string,
    pagination: PaginationDto,
  ): Promise<
    PaginatedResponse<{
      id: string;
      url: string;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>
  > {
    await this.assertBusinessAccess(businessId, userId, role);
    const { page, limit, skip } = getPaginationParams(pagination);
    const [list, total] = await this.endpointRepo.findAndCount({
      where: { businessId },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
    const data = list.map((e) => ({
      id: e.id,
      url: e.url,
      isActive: e.isActive,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }));
    return paginated(data, total, page, limit);
  }

  private toEndpointResponse(ep: WebhookEndpoint): WebhookEndpointResponseDto {
    return {
      id: ep.id,
      url: ep.url,
      isActive: ep.isActive,
      createdAt: ep.createdAt,
      updatedAt: ep.updatedAt,
    };
  }

  async getEndpoint(
    id: string,
    businessId: string,
    userId: string,
    role: string,
  ): Promise<WebhookEndpointResponseDto> {
    await this.assertBusinessAccess(businessId, userId, role);
    const ep = await this.findEndpointOrFail(id, businessId);
    return this.toEndpointResponse(ep);
  }

  async updateEndpoint(
    id: string,
    businessId: string,
    userId: string,
    role: string,
    dto: UpdateWebhookEndpointDto,
  ): Promise<WebhookEndpointResponseDto> {
    await this.assertBusinessAccess(businessId, userId, role);
    const ep = await this.findEndpointOrFail(id, businessId);
    if (dto.url !== undefined) ep.url = dto.url;
    if (dto.isActive !== undefined) ep.isActive = dto.isActive;
    const saved = await this.endpointRepo.save(ep);
    return this.toEndpointResponse(saved);
  }

  async deleteEndpoint(
    id: string,
    businessId: string,
    userId: string,
    role: string,
  ) {
    await this.assertBusinessAccess(businessId, userId, role);
    const ep = await this.findEndpointOrFail(id, businessId);
    await this.endpointRepo.remove(ep);
    this.logger.log(`Webhook endpoint eliminado: ${id}`);
    return { deleted: true };
  }

  async addSubscription(
    endpointId: string,
    businessId: string,
    userId: string,
    role: string,
    eventType: string,
  ) {
    await this.getEndpoint(endpointId, businessId, userId, role);
    const sub = this.subRepo.create({ endpointId, eventType });
    return this.subRepo.save(sub);
  }

  async listSubscriptions(
    endpointId: string,
    businessId: string,
    userId: string,
    role: string,
    pagination: PaginationDto,
  ): Promise<
    PaginatedResponse<{
      id: string;
      endpointId: string;
      eventType: string;
      createdAt: Date;
    }>
  > {
    await this.getEndpoint(endpointId, businessId, userId, role);
    const { page, limit, skip } = getPaginationParams(pagination);
    const [list, total] = await this.subRepo.findAndCount({
      where: { endpointId },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
    const data = list.map((s) => ({
      id: s.id,
      endpointId: s.endpointId,
      eventType: s.eventType,
      createdAt: s.createdAt,
    }));
    return paginated(data, total, page, limit);
  }

  async removeSubscription(
    subId: string,
    endpointId: string,
    businessId: string,
    userId: string,
    role: string,
  ) {
    await this.getEndpoint(endpointId, businessId, userId, role);
    const sub = await this.subRepo.findOne({
      where: { id: subId, endpointId },
    });
    if (!sub) throw new NotFoundException('Suscripción no encontrada');
    await this.subRepo.remove(sub);
    return { deleted: true };
  }
}
