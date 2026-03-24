import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from '../payments/entities/payment.entity';
import { Business } from '../businesses/entities/business.entity';
import { User, UserRole } from '../users/entities/user.entity';
import {
  PAYMENT_METRICS_STATUSES,
  PAYMENT_ESCROW_LOCKED_STATUSES,
} from './metrics.constants';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import {
  getPaginationParams,
  PaginatedResponse,
  paginated,
} from '../common/dto/pagination.dto';
import type { MerchantMetricsQuery } from './schemas/metrics-query.schema';
import type {
  AdminMerchantsMetricsQuery,
  AdminPaymentsTimeseriesQuery,
} from './schemas/metrics-query.schema';

const LAMPORTS_PER_SOL = 1_000_000_000n;

function lamportsToSolString(lamports: bigint): string {
  const whole = lamports / LAMPORTS_PER_SOL;
  const frac = lamports % LAMPORTS_PER_SOL;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(9, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}`;
}

export type BusinessPaymentMetricRow = {
  businessId: string;
  businessName: string;
  paymentCount: number;
  volumeLamports: string;
  volumeSol: string;
};

export type MerchantPaymentMetricRow = {
  userId: string;
  email: string;
  totalPayments: number;
  volumeLamports: string;
  volumeSol: string;
  estimatedCommissionLamports: string;
  /** Comisión estimada en SOL (misma fórmula que lamports). */
  estimatedCommissionSol: string;
  businessCount: number;
};

export type BusinessEscrowLockedRow = {
  businessId: string;
  businessName: string;
  paymentCount: number;
  lockedLamports: string;
  lockedSol: string;
};

export type PaymentTimeseriesPoint = {
  bucketStart: string;
  paymentCount: number;
  volumeLamports: string;
  volumeSol: string;
};

export type AdminPaymentsTimeseriesResponse = {
  groupBy: 'day' | 'week';
  buckets: number;
  range: { from: string; to: string };
  data: PaymentTimeseriesPoint[];
};

export type MerchantsVolumeDistributionResponse = {
  totalMerchants: number;
  /** Sin pagos escrow contabilizados en métricas. */
  nuevos: number;
  bajoVolumen: number;
  medio: number;
  altoValor: number;
};

export type EscrowLockedSummary = {
  /** Suma de SOL aún en escrow (no cobrados por el vendedor). */
  totalLockedLamports: string;
  totalLockedSol: string;
  paymentCount: number;
  /** Desglose por negocio. */
  byBusiness: BusinessEscrowLockedRow[];
  /** Estados incluidos en el cálculo. */
  statusesIncluded: readonly string[];
};

/** Embudo escrow: conteos por etapa (órdenes de tus negocios). */
export type MerchantPaymentFunnelStep = {
  key: string;
  label: string;
  count: number;
  /** Ancho relativo al primer paso (0–100). */
  percentOfFirst: number;
};

export type MerchantPaymentFunnelResponse = {
  steps: MerchantPaymentFunnelStep[];
};

@Injectable()
export class MetricsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  /**
   * Ranking de negocios del merchant (incluye negocios con 0 pagos en el filtro).
   */
  async getMyBusinessesPaymentMetrics(
    userId: string,
    query: MerchantMetricsQuery,
  ): Promise<{ data: BusinessPaymentMetricRow[] }> {
    const { from, to, sort } = query;

    const joinParams: Record<string, unknown> = {
      metricsStatuses: PAYMENT_METRICS_STATUSES,
    };
    let joinOn =
      'p.business_id = b.id AND p.status IN (:...metricsStatuses)';
    if (from) {
      joinOn += ' AND COALESCE(p.paid_at, p.created_at) >= :from';
      joinParams.from = new Date(from);
    }
    if (to) {
      joinOn += ' AND COALESCE(p.paid_at, p.created_at) <= :to';
      joinParams.to = new Date(to);
    }

    const qb = this.businessRepo
      .createQueryBuilder('b')
      .leftJoin(Payment, 'p', joinOn, joinParams)
      .where('b.user_id = :userId', { userId })
      .select('b.id', 'businessId')
      .addSelect('b.name', 'businessName')
      .addSelect('COUNT(p.id)', 'paymentCount')
      .addSelect('COALESCE(SUM(CAST(p.amount_lamports AS BIGINT)), 0)', 'volumeLamports')
      .groupBy('b.id')
      .addGroupBy('b.name');

    if (sort === 'volume') {
      qb.orderBy(
        'COALESCE(SUM(CAST(p.amount_lamports AS BIGINT)), 0)',
        'DESC',
      ).addOrderBy('b.name', 'ASC');
    } else {
      qb.orderBy('COUNT(p.id)', 'DESC').addOrderBy('b.name', 'ASC');
    }

    const raw = await qb.getRawMany<{
      businessId: string;
      businessName: string;
      paymentCount: string;
      volumeLamports: string;
    }>();

    const data: BusinessPaymentMetricRow[] = raw.map((r) => {
      const vol = BigInt(r.volumeLamports || '0');
      return {
        businessId: r.businessId,
        businessName: r.businessName,
        paymentCount: parseInt(r.paymentCount, 10),
        volumeLamports: vol.toString(),
        volumeSol: lamportsToSolString(vol),
      };
    });

    return { data };
  }

  /**
   * SOL aún bloqueado en escrow: el comprador ya pagó pero el vendedor no ha recibido el desembolso.
   */
  async getMyEscrowLockedSummary(
    userId: string,
    businessId?: string,
  ): Promise<EscrowLockedSummary> {
    if (businessId) {
      const owned = await this.businessRepo.findOne({
        where: { id: businessId, userId },
      });
      if (!owned) {
        throw new NotFoundException('Negocio no encontrado');
      }
    }

    const joinParams = { statuses: PAYMENT_ESCROW_LOCKED_STATUSES };
    const joinOn = 'p.business_id = b.id AND p.status IN (:...statuses)';

    const qb = this.businessRepo
      .createQueryBuilder('b')
      .leftJoin(Payment, 'p', joinOn, joinParams)
      .where('b.user_id = :userId', { userId });

    if (businessId) {
      qb.andWhere('b.id = :businessId', { businessId });
    }

    qb.select('b.id', 'businessId')
      .addSelect('b.name', 'businessName')
      .addSelect('COUNT(p.id)', 'paymentCount')
      .addSelect('COALESCE(SUM(CAST(p.amount_lamports AS BIGINT)), 0)', 'lockedLamports')
      .groupBy('b.id')
      .addGroupBy('b.name')
      .orderBy('b.name', 'ASC');

    const raw = await qb.getRawMany<{
      businessId: string;
      businessName: string;
      paymentCount: string;
      lockedLamports: string;
    }>();

    let totalLocked = 0n;
    let paymentCount = 0;

    const byBusiness: BusinessEscrowLockedRow[] = raw.map((r) => {
      const locked = BigInt(r.lockedLamports || '0');
      const cnt = parseInt(r.paymentCount, 10);
      totalLocked += locked;
      paymentCount += cnt;
      return {
        businessId: r.businessId,
        businessName: r.businessName,
        paymentCount: cnt,
        lockedLamports: locked.toString(),
        lockedSol: lamportsToSolString(locked),
      };
    });

    return {
      totalLockedLamports: totalLocked.toString(),
      totalLockedSol: lamportsToSolString(totalLocked),
      paymentCount,
      byBusiness,
      statusesIncluded: PAYMENT_ESCROW_LOCKED_STATUSES,
    };
  }

  /**
   * Embudo de órdenes/pagos por estado (solo negocios del merchant).
   * Excluye refunded y expired. Porcentajes respecto al total de órdenes activas.
   */
  async getMerchantPaymentFunnel(
    userId: string,
  ): Promise<MerchantPaymentFunnelResponse> {
    const raw = await this.paymentRepo
      .createQueryBuilder('p')
      .innerJoin('p.business', 'b')
      .where('b.user_id = :userId', { userId })
      .andWhere('p.status NOT IN (:...excluded)', {
        excluded: ['refunded', 'expired'] as const,
      })
      .select('p.status', 'status')
      .addSelect('COUNT(*)', 'cnt')
      .groupBy('p.status')
      .getRawMany<{ status: string; cnt: string }>();

    const count = (s: string) => {
      const row = raw.find((r) => r.status === s);
      return row ? parseInt(row.cnt, 10) : 0;
    };

    const pending = count('pending');
    const escrowLocked = count('escrow_locked');
    const disputed = count('disputed');
    const shipped = count('shipped');
    const released = count('released');
    const autoReleased = count('auto_released');

    /** Todas las órdenes en pipeline (sin refunded/expired). */
    const iniciadas =
      pending +
      escrowLocked +
      disputed +
      shipped +
      released +
      autoReleased;
    /** Comprador ya pagó (escrow o posterior). */
    const fondosRecibidos =
      escrowLocked + disputed + shipped + released + autoReleased;
    /** Vendedor marcó envío o ya liberado. */
    const entregaOmas = shipped + released + autoReleased;
    /** Desembolso al vendedor. */
    const liberados = released + autoReleased;

    const pct = (n: number) =>
      iniciadas > 0 ? Math.round((n / iniciadas) * 1000) / 10 : 0;

    const steps: MerchantPaymentFunnelStep[] = [
      {
        key: 'iniciadas',
        label: 'Iniciadas',
        count: iniciadas,
        percentOfFirst: iniciadas > 0 ? 100 : 0,
      },
      {
        key: 'fondos_recibidos',
        label: 'Fondos en escrow / pagados',
        count: fondosRecibidos,
        percentOfFirst: pct(fondosRecibidos),
      },
      {
        key: 'entrega',
        label: 'Entrega confirmada',
        count: entregaOmas,
        percentOfFirst: pct(entregaOmas),
      },
      {
        key: 'liberados',
        label: 'Fondos liberados',
        count: liberados,
        percentOfFirst: pct(liberados),
      },
    ];

    return { steps };
  }

  /**
   * Métricas agregadas por cuenta merchant (usuario), solo rol merchant.
   */
  async getAdminMerchantsPaymentMetrics(
    query: AdminMerchantsMetricsQuery,
  ): Promise<
    PaginatedResponse<MerchantPaymentMetricRow> & { commissionBps: number }
  > {
    const { page, limit, skip } = getPaginationParams(query);
    const { from, to, sort } = query;
    const commissionBps = await this.platformSettings.getCommissionBps();

    const joinParams: Record<string, unknown> = {
      metricsStatuses: PAYMENT_METRICS_STATUSES,
    };
    let paymentJoinOn =
      'p.business_id = b.id AND p.status IN (:...metricsStatuses)';
    if (from) {
      paymentJoinOn += ' AND COALESCE(p.paid_at, p.created_at) >= :from';
      joinParams.from = new Date(from);
    }
    if (to) {
      paymentJoinOn += ' AND COALESCE(p.paid_at, p.created_at) <= :to';
      joinParams.to = new Date(to);
    }

    const inner = this.userRepo
      .createQueryBuilder('u')
      .leftJoin(Business, 'b', 'b.user_id = u.id')
      .leftJoin(Payment, 'p', paymentJoinOn, joinParams)
      .where('u.role = :role', { role: UserRole.MERCHANT })
      .select('u.id', 'userId')
      .addSelect('u.email', 'email')
      .addSelect('COUNT(DISTINCT b.id)', 'businessCount')
      .addSelect('COUNT(p.id)', 'totalPayments')
      .addSelect('COALESCE(SUM(CAST(p.amount_lamports AS BIGINT)), 0)', 'volumeLamports')
      .addSelect(
        `COALESCE(SUM((CAST(p.amount_lamports AS BIGINT) * :commissionBps) / 10000), 0)`,
        'estimatedCommissionLamports',
      )
      .setParameter('commissionBps', commissionBps)
      .groupBy('u.id')
      .addGroupBy('u.email');

    const total = await this.userRepo.count({
      where: { role: UserRole.MERCHANT },
    });

    if (sort === 'volume') {
      inner
        .orderBy('COALESCE(SUM(CAST(p.amount_lamports AS BIGINT)), 0)', 'DESC')
        .addOrderBy('u.email', 'ASC');
    } else {
      inner.orderBy('COUNT(p.id)', 'DESC').addOrderBy('u.email', 'ASC');
    }

    inner.offset(skip).limit(limit);

    const rows = await inner.getRawMany<{
      userId: string;
      email: string;
      businessCount: string;
      totalPayments: string;
      volumeLamports: string;
      estimatedCommissionLamports: string;
    }>();

    const data: MerchantPaymentMetricRow[] = rows.map((r) => {
      const vol = BigInt(r.volumeLamports || '0');
      const comm = BigInt(r.estimatedCommissionLamports || '0');
      return {
        userId: r.userId,
        email: r.email,
        totalPayments: parseInt(r.totalPayments, 10),
        volumeLamports: vol.toString(),
        volumeSol: lamportsToSolString(vol),
        estimatedCommissionLamports: comm.toString(),
        estimatedCommissionSol: lamportsToSolString(comm),
        businessCount: parseInt(r.businessCount, 10),
      };
    });

    return {
      commissionBps,
      ...paginated(data, total, page, limit),
    };
  }

  /**
   * Pagos escrow por día o semana (agregación diaria en SQL; semanas = suma de 7 días).
   */
  async getAdminPaymentsTimeseries(
    query: AdminPaymentsTimeseriesQuery,
  ): Promise<AdminPaymentsTimeseriesResponse> {
    return this.buildPaymentsTimeseries(query);
  }

  /**
   * Misma serie que admin, limitada a negocios del usuario merchant.
   */
  async getMerchantPaymentsTimeseries(
    userId: string,
    query: AdminPaymentsTimeseriesQuery,
  ): Promise<AdminPaymentsTimeseriesResponse> {
    return this.buildPaymentsTimeseries(query, { merchantUserId: userId });
  }

  private async buildPaymentsTimeseries(
    query: AdminPaymentsTimeseriesQuery,
    opts?: { merchantUserId?: string },
  ): Promise<AdminPaymentsTimeseriesResponse> {
    const { groupBy, buckets } = query;
    const now = new Date();
    const end = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );

    let rangeStart: Date;
    let expectedDayKeys: string[] | null = null;
    let expectedWeekMondays: Date[] | null = null;

    if (groupBy === 'day') {
      rangeStart = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() - (buckets - 1),
          0,
          0,
          0,
          0,
        ),
      );
      expectedDayKeys = [];
      for (let i = 0; i < buckets; i++) {
        const d = new Date(rangeStart);
        d.setUTCDate(d.getUTCDate() + i);
        expectedDayKeys.push(d.toISOString().slice(0, 10));
      }
    } else {
      const endMonday = MetricsService.mondayUtc(now);
      const startMonday = new Date(endMonday);
      startMonday.setUTCDate(startMonday.getUTCDate() - 7 * (buckets - 1));
      rangeStart = new Date(startMonday);
      expectedWeekMondays = [];
      for (let i = 0; i < buckets; i++) {
        const d = new Date(startMonday);
        d.setUTCDate(d.getUTCDate() + 7 * i);
        expectedWeekMondays.push(new Date(d));
      }
    }

    const qb = this.paymentRepo
      .createQueryBuilder('p')
      .select(
        `DATE_TRUNC('day', COALESCE(p.paid_at, p.created_at))`,
        'bucket',
      )
      .addSelect('COUNT(p.id)', 'paymentCount')
      .addSelect(
        'COALESCE(SUM(CAST(p.amount_lamports AS BIGINT)), 0)',
        'volumeLamports',
      );

    if (opts?.merchantUserId) {
      qb.innerJoin('p.business', 'b')
        .where('b.user_id = :merchantUserId', {
          merchantUserId: opts.merchantUserId,
        })
        .andWhere('p.status IN (:...statuses)', {
          statuses: PAYMENT_METRICS_STATUSES,
        });
    } else {
      qb.where('p.status IN (:...statuses)', {
        statuses: PAYMENT_METRICS_STATUSES,
      });
    }

    const raw = await qb
      .andWhere('COALESCE(p.paid_at, p.created_at) >= :from', {
        from: rangeStart,
      })
      .andWhere('COALESCE(p.paid_at, p.created_at) <= :to', { to: end })
      .groupBy('bucket')
      .orderBy('bucket', 'ASC')
      .getRawMany<{
        bucket: Date | string;
        paymentCount: string;
        volumeLamports: string;
      }>();

    const dailyMap = new Map<string, { cnt: number; vol: bigint }>();
    for (const row of raw) {
      const b =
        row.bucket instanceof Date ? row.bucket : new Date(String(row.bucket));
      const key = b.toISOString().slice(0, 10);
      dailyMap.set(key, {
        cnt: parseInt(row.paymentCount, 10),
        vol: BigInt(row.volumeLamports || '0'),
      });
    }

    let data: PaymentTimeseriesPoint[];

    if (groupBy === 'day') {
      data = expectedDayKeys!.map((key) => {
        const hit = dailyMap.get(key);
        const vol = hit?.vol ?? 0n;
        const cnt = hit?.cnt ?? 0;
        return {
          bucketStart: `${key}T00:00:00.000Z`,
          paymentCount: cnt,
          volumeLamports: vol.toString(),
          volumeSol: lamportsToSolString(vol),
        };
      });
    } else {
      data = expectedWeekMondays!.map((monday) => {
        let cnt = 0;
        let vol = 0n;
        for (let d = 0; d < 7; d++) {
          const day = new Date(monday);
          day.setUTCDate(day.getUTCDate() + d);
          const key = day.toISOString().slice(0, 10);
          const hit = dailyMap.get(key);
          if (hit) {
            cnt += hit.cnt;
            vol += hit.vol;
          }
        }
        const key = monday.toISOString().slice(0, 10);
        return {
          bucketStart: `${key}T00:00:00.000Z`,
          paymentCount: cnt,
          volumeLamports: vol.toString(),
          volumeSol: lamportsToSolString(vol),
        };
      });
    }

    return {
      groupBy,
      buckets,
      range: { from: rangeStart.toISOString(), to: end.toISOString() },
      data,
    };
  }

  /**
   * Merchants sin pagos vs terciles de volumen (entre los que tienen pagos).
   */
  async getAdminMerchantsVolumeDistribution(): Promise<MerchantsVolumeDistributionResponse> {
    const raw = await this.userRepo
      .createQueryBuilder('u')
      .leftJoin(Business, 'b', 'b.user_id = u.id')
      .leftJoin(
        Payment,
        'p',
        'p.business_id = b.id AND p.status IN (:...metricsStatuses)',
        { metricsStatuses: PAYMENT_METRICS_STATUSES },
      )
      .where('u.role = :role', { role: UserRole.MERCHANT })
      .select('u.id', 'userId')
      .addSelect(
        'COALESCE(SUM(CAST(p.amount_lamports AS BIGINT)), 0)',
        'volumeLamports',
      )
      .groupBy('u.id')
      .getRawMany<{ userId: string; volumeLamports: string }>();

    const vols = raw.map((r) => BigInt(r.volumeLamports || '0'));
    const nuevos = vols.filter((v) => v === 0n).length;
    const withPayments = vols.filter((v) => v > 0n);

    let bajoVolumen = 0;
    let medio = 0;
    let altoValor = 0;

    if (withPayments.length > 0) {
      const sorted = [...withPayments].sort((a, b) => {
        if (a < b) return -1;
        if (a > b) return 1;
        return 0;
      });
      const len = sorted.length;
      const t1 = sorted[Math.floor(len * 0.33)] ?? sorted[0];
      const t2 = sorted[Math.floor(len * 0.66)] ?? sorted[len - 1];
      for (const v of withPayments) {
        if (v <= t1) bajoVolumen++;
        else if (v <= t2) medio++;
        else altoValor++;
      }
    }

    return {
      totalMerchants: vols.length,
      nuevos,
      bajoVolumen,
      medio,
      altoValor,
    };
  }

  private static mondayUtc(d: Date): Date {
    const day = d.getUTCDay();
    const offset = day === 0 ? -6 : 1 - day;
    const r = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offset),
    );
    r.setUTCHours(0, 0, 0, 0);
    return r;
  }
}
