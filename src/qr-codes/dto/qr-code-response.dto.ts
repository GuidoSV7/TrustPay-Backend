export class QrCodeResponseDto {
  id: string;
  businessId: string;
  label: string;
  type: string;
  amountLamports: string | null;
  tokenMint: string | null;
  solanaPayUrl: string;
  qrImageUrl: string | null;
  /** Pubkey `reference` (Solana Pay) para correlacionar el pago on-chain. */
  referencePubkey: string | null;
  paymentConfirmedAt: Date | null;
  paymentSignature: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
