import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QrCode } from './entities/qr-code.entity';
import { Business } from '../businesses/entities/business.entity';
import type { CreateQrCodeDto } from './schemas/create-qr-code.schema';
import type { UpdateQrCodeDto } from './schemas/update-qr-code.schema';
import { QrCodeResponseDto } from './dto/qr-code-response.dto';
import { UserRole } from '../users/entities/user.entity';
import {
  PaginationDto,
  getPaginationParams,
  PaginatedResponse,
  paginated,
} from '../common/dto/pagination.dto';
import { SolanaPayQrService } from '../solana/solana-pay-qr.service';

@Injectable()
export class QrCodesService {
  private readonly logger = new Logger(QrCodesService.name);

  constructor(
    @InjectRepository(QrCode) private readonly repo: Repository<QrCode>,
    @InjectRepository(Business) private readonly businessRepo: Repository<Business>,
    private readonly solanaPayQr: SolanaPayQrService,
  ) {}

  private async findQrOrFail(id: string, businessId: string): Promise<QrCode> {
    const q = await this.repo.findOne({ where: { id, businessId } });
    if (!q) throw new NotFoundException('QR no encontrado');
    return q;
  }

  private async assertBusinessAccess(
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

  private toResponse(q: QrCode): QrCodeResponseDto {
    return { ...q };
  }

  async create(
    businessId: string,
    userId: string,
    role: string,
    dto: CreateQrCodeDto,
  ): Promise<QrCodeResponseDto> {
    const b = await this.assertBusinessAccess(businessId, userId, role);
    if (!b.isVerified) {
      throw new BadRequestException(
        'El negocio debe estar verificado on-chain antes de generar códigos QR de pago',
      );
    }

    const { solanaPayUrl, qrImageDataUrl, referencePubkey } =
      await this.solanaPayQr.buildPaymentQr({
        recipientWallet: b.walletAddress,
        label: dto.label,
        amountLamports: dto.amountLamports,
        tokenMint: dto.tokenMint,
      });

    const q = this.repo.create({
      ...dto,
      businessId,
      solanaPayUrl,
      qrImageUrl: qrImageDataUrl,
      referencePubkey,
      isActive: true,
    });
    const saved = await this.repo.save(q);
    this.logger.log(`QR creado: ${saved.id} (negocio ${businessId})`);
    return this.toResponse(saved);
  }

  async findAllByBusiness(
    businessId: string,
    userId: string,
    role: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResponse<QrCodeResponseDto>> {
    await this.assertBusinessAccess(businessId, userId, role);
    const { page, limit, skip } = getPaginationParams(pagination);
    const [items, total] = await this.repo.findAndCount({
      where: { businessId },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
    const data = items.map((q) => this.toResponse(q));
    return paginated(data, total, page, limit);
  }

  async findOne(
    id: string,
    businessId: string,
    userId: string,
    role: string,
  ): Promise<QrCodeResponseDto> {
    await this.assertBusinessAccess(businessId, userId, role);
    const q = await this.findQrOrFail(id, businessId);
    return this.toResponse(q);
  }

  async update(
    id: string,
    businessId: string,
    userId: string,
    role: string,
    dto: UpdateQrCodeDto,
  ): Promise<QrCodeResponseDto> {
    const b = await this.assertBusinessAccess(businessId, userId, role);
    const q = await this.findQrOrFail(id, businessId);

    const paymentFieldsChanged =
      dto.label !== undefined ||
      dto.amountLamports !== undefined ||
      dto.tokenMint !== undefined;

    Object.assign(q, dto);

    if (paymentFieldsChanged) {
      if (!b.isVerified) {
        throw new BadRequestException(
          'El negocio debe estar verificado on-chain para actualizar datos de pago del QR',
        );
      }
      const built = await this.solanaPayQr.buildPaymentQr({
        recipientWallet: b.walletAddress,
        label: q.label,
        amountLamports: q.amountLamports,
        tokenMint: q.tokenMint,
      });
      q.solanaPayUrl = built.solanaPayUrl;
      q.qrImageUrl = built.qrImageDataUrl;
      q.referencePubkey = built.referencePubkey;
      q.paymentConfirmedAt = null;
      q.paymentSignature = null;
    }

    const saved = await this.repo.save(q);
    return this.toResponse(saved);
  }

  async remove(
    id: string,
    businessId: string,
    userId: string,
    role: string,
  ) {
    await this.assertBusinessAccess(businessId, userId, role);
    const q = await this.findQrOrFail(id, businessId);
    await this.repo.remove(q);
    this.logger.log(`QR eliminado: ${id}`);
    return { deleted: true };
  }
}
