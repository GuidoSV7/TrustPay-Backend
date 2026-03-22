import { Module } from '@nestjs/common';
import { SolanaService } from './solana.service';
import { SolanaPayQrService } from './solana-pay-qr.service';

@Module({
  providers: [SolanaService, SolanaPayQrService],
  exports: [SolanaService, SolanaPayQrService],
})
export class SolanaModule {}
