import { Injectable, BadRequestException } from '@nestjs/common';
import { Keypair } from '@solana/web3.js';
import {
  encodeURL,
  createQRDataURL,
  createQROptions,
  createRecipient,
  createSPLToken,
  isValidSolanaAddress,
} from '@solana-commerce/solana-pay';

export type BuildPaymentQrInput = {
  /** Wallet del negocio (recipient) */
  recipientWallet: string;
  /** Etiqueta mostrada en la billetera */
  label: string;
  /** Monto en unidades atómicas (lamports para SOL / unidades mínimas para SPL). null = monto libre en wallet */
  amountLamports: string | null;
  /** Mint SPL o null para SOL */
  tokenMint: string | null;
};

/**
 * Genera URL Solana Pay (transfer request) y una imagen QR (data URL SVG)
 * usando @solana-commerce/solana-pay. Un solo lugar de verdad para URLs de pago.
 */
@Injectable()
export class SolanaPayQrService {
  private static readonly QR_SIZE = 512;

  /**
   * Incluye una `reference` nueva por QR para poder correlacionar pagos on-chain.
   */
  async buildPaymentQr(input: BuildPaymentQrInput): Promise<{
    solanaPayUrl: string;
    qrImageDataUrl: string;
    /** Base58 del pubkey usado como `reference` en Solana Pay (persistir en BD). */
    referencePubkey: string;
  }> {
    const w = input.recipientWallet.trim();
    if (!isValidSolanaAddress(w)) {
      throw new BadRequestException('La wallet del negocio no es una dirección Solana válida');
    }

    if (input.tokenMint != null && input.tokenMint !== '') {
      const mint = input.tokenMint.trim();
      if (!isValidSolanaAddress(mint)) {
        throw new BadRequestException('El mint del token no es una dirección Solana válida');
      }
    }

    let amount: bigint | undefined;
    if (input.amountLamports != null && input.amountLamports.trim() !== '') {
      try {
        amount = BigInt(input.amountLamports.trim());
      } catch {
        throw new BadRequestException('amountLamports debe ser un entero válido (unidades atómicas)');
      }
      if (amount <= 0n) {
        throw new BadRequestException('El monto debe ser mayor que cero');
      }
    }

    const referenceKp = Keypair.generate();

    const payUrl = encodeURL({
      recipient: createRecipient(w),
      amount,
      splToken:
        input.tokenMint != null && input.tokenMint.trim() !== ''
          ? createSPLToken(input.tokenMint.trim())
          : undefined,
      reference: createRecipient(referenceKp.publicKey.toBase58()),
      label: input.label,
      message: `TrustPay · ${input.label}`,
    });

    const urlString = payUrl.toString();
    const opts = createQROptions(
      urlString,
      SolanaPayQrService.QR_SIZE,
      'white',
      'black',
    );
    const qrImageDataUrl = await createQRDataURL(urlString, opts);

    return {
      solanaPayUrl: urlString,
      qrImageDataUrl,
      referencePubkey: referenceKp.publicKey.toBase58(),
    };
  }
}
