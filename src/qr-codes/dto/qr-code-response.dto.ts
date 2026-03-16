export class QrCodeResponseDto {
  id: string;
  businessId: string;
  label: string;
  type: string;
  amountLamports: string | null;
  tokenMint: string | null;
  solanaPayUrl: string;
  qrImageUrl: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
