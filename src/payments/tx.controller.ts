import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { PaymentsService } from './payments.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { txPostBodySchema } from './schemas/tx-post-body.schema';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Endpoints que Phantom llama para Transaction Request.
 * GET y POST son públicos (Phantom no envía JWT).
 */
@Controller('tx')
export class TxController {
  private readonly logger = new Logger(TxController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  @Get(':paymentId')
  @Public()
  async getTxInfo(
    @Param('paymentId') paymentId: string,
    @Req() req: Request,
  ): Promise<{ label: string; icon: string }> {
    const ua = req.get('user-agent') ?? '(sin user-agent)';
    const fwd = req.get('x-forwarded-for') ?? req.socket.remoteAddress ?? '?';
    this.logger.log(
      `[Phantom/Solana Pay] GET /tx/${paymentId} | ip=${fwd} | ua=${ua.slice(0, 120)}`,
    );
    try {
      const result = await this.paymentsService.getTxInfo(paymentId);
      this.logger.log(
        `[Phantom/Solana Pay] GET /tx/${paymentId} OK → label="${result.label}" icon=${result.icon ? 'sí' : 'vacío'}`,
      );
      return result;
    } catch (err) {
      this.logger.warn(
        `[Phantom/Solana Pay] GET /tx/${paymentId} ERROR: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }

  @Post(':paymentId')
  @Public()
  async postTx(
    @Param('paymentId') paymentId: string,
    @Body(new ZodValidationPipe(txPostBodySchema)) body: z.infer<typeof txPostBodySchema>,
    @Req() req: Request,
  ): Promise<{ transaction: string; message: string }> {
    const ua = req.get('user-agent') ?? '(sin user-agent)';
    const fwd = req.get('x-forwarded-for') ?? req.socket.remoteAddress ?? '?';
    const buyerShort = `${body.account.slice(0, 8)}…${body.account.slice(-4)}`;
    this.logger.log(
      `[Phantom/Solana Pay] POST /tx/${paymentId} | buyer=${buyerShort} | ip=${fwd} | ua=${ua.slice(0, 120)}`,
    );
    try {
      const result = await this.paymentsService.buildEscrowTransaction(
        paymentId,
        body.account,
      );
      this.logger.log(
        `[Phantom/Solana Pay] POST /tx/${paymentId} OK → tx base64 length=${result.transaction.length} message="${(result.message ?? '').slice(0, 80)}"`,
      );
      return result;
    } catch (err) {
      this.logger.warn(
        `[Phantom/Solana Pay] POST /tx/${paymentId} ERROR: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }
}
