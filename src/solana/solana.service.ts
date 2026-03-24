import {
  Injectable,
  Logger,
  OnModuleInit,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import * as crypto from 'crypto';

@Injectable()
export class SolanaService implements OnModuleInit {
  private readonly logger = new Logger(SolanaService.name);

  private connection: Connection;
  private authority: Keypair;
  private programId: PublicKey;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const rpcUrl = this.config.getOrThrow<string>('SOLANA_RPC_URL');
    const programIdStr = this.config.getOrThrow<string>('SOLANA_PROGRAM_ID');
    const keypairRaw = this.config.getOrThrow<string>('TRUSTPAY_KEYPAIR');

    this.connection = new Connection(rpcUrl, 'confirmed');
    this.programId = new PublicKey(programIdStr);

    const secretKey = Uint8Array.from(JSON.parse(keypairRaw) as number[]);
    this.authority = Keypair.fromSecretKey(secretKey);

    this.logger.log(
      `SolanaService iniciado | authority: ${this.authority.publicKey.toBase58()} | program: ${programIdStr}`,
    );
  }

  getConnection(): Connection {
    return this.connection;
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private ixDiscriminator(name: string): Buffer {
    return Buffer.from(
      crypto.createHash('sha256').update(`global:${name}`).digest(),
    ).subarray(0, 8);
  }

  /**
   * Deriva la Business PDA: seeds = ["business", owner]
   * Coincide exactamente con el contrato:
   * seeds = [b"business", owner.key().as_ref()]
   */
  private getBusinessPda(ownerPubkey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('business'), ownerPubkey.toBuffer()],
      this.programId,
    );
  }

  private encodeString(value: string): Buffer {
    const encoded = Buffer.from(value, 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32LE(encoded.length, 0);
    return Buffer.concat([len, encoded]);
  }

  // ─── instrucciones públicas ────────────────────────────────────────────────

  /**
   * Registra un negocio on-chain creando la Business PDA.
   * El backend (authority) paga la cuenta; el merchant no necesita firmar.
   */
  async registrarNegocio(
    businessId: string,
    ownerWallet: string,
  ): Promise<string> {
    let owner: PublicKey;
    try {
      owner = new PublicKey(ownerWallet);
    } catch {
      throw new BadRequestException(
        `walletAddress inválido: "${ownerWallet}" no es una pubkey Solana`,
      );
    }

    // ✅ Sin hash del businessId — solo ["business", owner]
    const [businessPda] = this.getBusinessPda(owner);
    const discriminator = this.ixDiscriminator('registrar_negocio');
    const data = Buffer.concat([discriminator, this.encodeString(businessId)]);

    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: this.authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: owner, isSigner: false, isWritable: false },
        { pubkey: businessPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });

    try {
      const tx = new Transaction().add(ix);
      const signature = await sendAndConfirmTransaction(
        this.connection,
        tx,
        [this.authority],
        { commitment: 'confirmed' },
      );
      this.logger.log(
        `registrar_negocio OK | business: ${businessId} | pda: ${businessPda.toBase58()} | tx: ${signature}`,
      );
      return signature;
    } catch (err) {
      this.logger.error(`registrar_negocio FAILED | business: ${businessId}`, err);
      throw new InternalServerErrorException(
        `No se pudo registrar el negocio en la blockchain: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Verifica un negocio on-chain (is_verified = true).
   * Solo la authority de TrustPay puede ejecutar esta instrucción.
   * El contrato NO recibe argumentos — solo cuentas.
   */
  async verificarNegocio(
    ownerWallet: string,
    businessId: string,
  ): Promise<string> {
    const owner = new PublicKey(ownerWallet);

    // ✅ Sin hash del businessId — solo ["business", owner]
    const [businessPda] = this.getBusinessPda(owner);
    const discriminator = this.ixDiscriminator('verificar_negocio');

    // ✅ Sin argumentos — el contrato verificar_negocio no recibe parámetros
    const data = discriminator;

    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: this.authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: owner, isSigner: false, isWritable: false },
        { pubkey: businessPda, isSigner: false, isWritable: true },
      ],
      data,
    });

    try {
      const tx = new Transaction().add(ix);
      const signature = await sendAndConfirmTransaction(
        this.connection,
        tx,
        [this.authority],
        { commitment: 'confirmed' },
      );
      this.logger.log(
        `verificar_negocio OK | business: ${businessId} | wallet: ${ownerWallet} | tx: ${signature}`,
      );
      return signature;
    } catch (err) {
      this.logger.error(
        `verificar_negocio FAILED | business: ${businessId} | wallet: ${ownerWallet}`,
        err,
      );
      throw new InternalServerErrorException(
        `No se pudo verificar el negocio en la blockchain: ${(err as Error).message}`,
      );
    }
  }

  private normalizeTransactionIdForEscrow(raw: string): string {
    const t = raw.trim();
    const noHyphens = t.replace(/-/g, '');
    if (/^[0-9a-fA-F]{32}$/.test(noHyphens)) {
      return noHyphens.toLowerCase();
    }
    const b = Buffer.from(t, 'utf8');
    if (b.length <= 32) {
      return t;
    }
    throw new BadRequestException(
      `transactionId inválido para PDA (${b.length} bytes; máx. 32). UUID hex sin guiones o ≤32 caracteres.`,
    );
  }

  getEscrowPda(buyerPubkey: PublicKey, transactionId: string): [PublicKey, number] {
    const normalized = this.normalizeTransactionIdForEscrow(transactionId);
    const seedTx = Buffer.from(normalized, 'utf8');
    return PublicKey.findProgramAddressSync(
      [Buffer.from('escrow'), buyerPubkey.toBuffer(), seedTx],
      this.programId,
    );
  }

  buildCrearEscrowTransaction(
    buyerWallet: PublicKey,
    sellerWallet: PublicKey,
    transactionId: string,
    amountLamports: bigint,
  ): Transaction {
    const normalized = this.normalizeTransactionIdForEscrow(transactionId);
    const [escrowPda] = this.getEscrowPda(buyerWallet, normalized);
    const discriminator = this.ixDiscriminator('crear_escrow');

    const txIdEncoded = this.encodeString(normalized);
    const amountBuf = Buffer.alloc(8);
    amountBuf.writeBigUInt64LE(amountLamports);
    const data = Buffer.concat([discriminator, txIdEncoded, amountBuf]);

    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: buyerWallet, isSigner: true, isWritable: true },
        { pubkey: sellerWallet, isSigner: false, isWritable: false },
        { pubkey: escrowPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });

    return new Transaction().add(ix);
  }

  buildLiberarEscrowTransaction(
    buyerWallet: PublicKey,
    sellerWallet: PublicKey,
    transactionId: string,
  ): Transaction {
    const normalized = this.normalizeTransactionIdForEscrow(transactionId);
    const [escrowPda] = this.getEscrowPda(buyerWallet, normalized);
    const discriminator = this.ixDiscriminator('liberar_escrow');

    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: buyerWallet, isSigner: true, isWritable: true },
        { pubkey: sellerWallet, isSigner: false, isWritable: true },
        { pubkey: escrowPda, isSigner: false, isWritable: true },
      ],
      data: discriminator,
    });

    return new Transaction().add(ix);
  }

  getProgramId(): PublicKey {
    return this.programId;
  }

  /** Wallet de la authority TrustPay (misma que firma verificar negocio). Sirve como destino de comisiones si no hay PLATFORM_FEE_WALLET. */
  getAuthorityPublicKey(): PublicKey {
    return this.authority.publicKey;
  }

  async isEscrowLocked(
    buyerWallet: PublicKey,
    transactionId: string,
  ): Promise<boolean> {
    const [escrowPda] = this.getEscrowPda(buyerWallet, transactionId);
    try {
      const accountInfo = await this.connection.getAccountInfo(escrowPda);
      if (!accountInfo || !accountInfo.data || accountInfo.data.length < 81) {
        return false;
      }
      const status = accountInfo.data.readUInt8(80);
      return status === 1;
    } catch {
      return false;
    }
  }

  async isEscrowReleased(
    buyerWallet: PublicKey,
    transactionId: string,
  ): Promise<boolean> {
    const [escrowPda] = this.getEscrowPda(buyerWallet, transactionId);
    try {
      const accountInfo = await this.connection.getAccountInfo(escrowPda);
      if (!accountInfo || !accountInfo.data || accountInfo.data.length < 81) {
        return false;
      }
      const status = accountInfo.data.readUInt8(80);
      return status === 2;
    } catch {
      return false;
    }
  }
}