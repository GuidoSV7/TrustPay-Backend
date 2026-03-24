import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { Business } from '../businesses/entities/business.entity';
import { UserRole } from '../users/entities/user.entity';
import {
  PaginationDto,
  getPaginationParams,
  PaginatedResponse,
  paginated,
} from '../common/dto/pagination.dto';

const LAMPORTS_PER_SOL = 1_000_000_000;

function lamportsToSol(lamports: string | null): string | null {
  if (lamports == null || lamports === '') return null;
  const n = BigInt(lamports);
  const sol = Number(n) / LAMPORTS_PER_SOL;
  return sol.toFixed(sol % 1 === 0 ? 0 : 9).replace(/\.?0+$/, '');
}

export type TransactionListItem = {
  id: string;
  businessId: string;
  businessName?: string;
  qrCodeId: string;
  qrLabel?: string;
  signature: string;
  referencePubkey: string;
  amountLamports: string | null;
  /** Monto en SOL legible (ej. "0.1"). */
  amountSol: string | null;
  tokenMint: string | null;
  slot: string | null;
  confirmedAt: Date;
  createdAt: Date;
};

export type TransactionsSummary = {
  totalTransactions: number;
  /** Suma de amount_lamports solo donde el QR tenía monto fijo (puede subestimar montos abiertos). */
  totalLamportsFixedAmount: string;
  byDay: { date: string; count: number; lamportsSum: string }[];
};

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
  ) {}

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
    return b;
  }

  async findByBusiness(
    businessId: string,
    userId: string,
    role: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResponse<TransactionListItem>> {
    await this.assertBusinessAccess(businessId, userId, role);
    const { page, limit, skip } = getPaginationParams(pagination);

    const [rows, total] = await this.transactionRepo.findAndCount({
      where: { businessId },
      relations: ['business', 'qrCode'],
      order: { confirmedAt: 'DESC' },
      skip,
      take: limit,
    });

    const data: TransactionListItem[] = rows.map((t) => ({
      id: t.id,
      businessId: t.businessId,
      businessName: (t as { business?: { name?: string } }).business?.name,
      qrCodeId: t.qrCodeId,
      qrLabel: (t as { qrCode?: { label?: string } }).qrCode?.label,
      signature: t.signature,
      referencePubkey: t.referencePubkey,
      amountLamports: t.amountLamports,
      amountSol: lamportsToSol(t.amountLamports),
      tokenMint: t.tokenMint,
      slot: t.slot,
      confirmedAt: t.confirmedAt,
      createdAt: t.createdAt,
    }));

    return paginated(data, total, page, limit);
  }

  /**
   * Resumen para métricas: totales y agrupación por día (UTC).
   */
  async getSummaryForBusiness(
    businessId: string,
    userId: string,
    role: string,
  ): Promise<TransactionsSummary> {
    await this.assertBusinessAccess(businessId, userId, role);

    const rawTotals = await this.transactionRepo
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.amount_lamports), 0)', 'lamports')
      .where('t.business_id = :businessId', { businessId })
      .andWhere('t.amount_lamports IS NOT NULL')
      .getRawOne<{ lamports: string }>();

    const totalTransactions = await this.transactionRepo.count({
      where: { businessId },
    });

    const byDayRaw = await this.transactionRepo
      .createQueryBuilder('t')
      .select("date_trunc('day', t.confirmed_at AT TIME ZONE 'UTC')", 'day')
      .addSelect('COUNT(t.id)', 'count')
      .addSelect('COALESCE(SUM(t.amount_lamports), 0)', 'lamports')
      .where('t.business_id = :businessId', { businessId })
      .groupBy("date_trunc('day', t.confirmed_at AT TIME ZONE 'UTC')")
      .orderBy('day', 'ASC')
      .getRawMany<{ day: Date; count: string; lamports: string }>();

    const byDay = byDayRaw.map((r) => ({
      date: (r.day as Date).toISOString().slice(0, 10),
      count: parseInt(r.count, 10),
      lamportsSum: String(r.lamports ?? '0'),
    }));

    return {
      totalTransactions,
      totalLamportsFixedAmount: rawTotals?.lamports ?? '0',
      byDay,
    };
  }

  /** Listado global: admin ve todos; merchant solo transacciones de sus negocios. */
  async findAllForUser(
    userId: string,
    role: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResponse<TransactionListItem>> {
    const { page, limit, skip } = getPaginationParams(pagination);

    const qb = this.transactionRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.business', 'b')
      .leftJoinAndSelect('t.qrCode', 'q')
      .orderBy('t.confirmedAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (role !== UserRole.ADMIN) {
      qb.andWhere('b.userId = :userId', { userId });
    }
    const [rows, total] = await qb.getManyAndCount();

    const data: TransactionListItem[] = rows.map((t) => ({
      id: t.id,
      businessId: t.businessId,
      businessName: (t as { business?: { name?: string } }).business?.name,
      qrCodeId: t.qrCodeId,
      qrLabel: (t as { qrCode?: { label?: string } }).qrCode?.label,
      signature: t.signature,
      referencePubkey: t.referencePubkey,
      amountLamports: t.amountLamports,
      amountSol: lamportsToSol(t.amountLamports),
      tokenMint: t.tokenMint,
      slot: t.slot,
      confirmedAt: t.confirmedAt,
      createdAt: t.createdAt,
    }));

    return paginated(data, total, page, limit);
  }
}
