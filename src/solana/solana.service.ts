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
import * as borsh from '@coral-xyz/borsh';

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

  /** Conexión RPC (Solana Pay, polling de pagos, etc.). */
  getConnection(): Connection {
    return this.connection;
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  /** Calcula el discriminador de instrucción: sha256("global:<name>")[0..8] */
  private ixDiscriminator(name: string): Buffer {
    return Buffer.from(
      crypto.createHash('sha256').update(`global:${name}`).digest(),
    ).subarray(0, 8);
  }

  /**
   * Deriva la Business PDA: seeds = ["business", owner, sha256(utf8(business_id))].
   * Debe coincidir con `hash(business_id.as_bytes())` del programa Anchor.
   * Así cada negocio (UUID) tiene su propia cuenta aunque la wallet sea la misma.
   */
  private getBusinessPda(
    ownerPubkey: PublicKey,
    businessId: string,
  ): [PublicKey, number] {
    const digest = crypto
      .createHash('sha256')
      .update(businessId, 'utf8')
      .digest();
    return PublicKey.findProgramAddressSync(
      [Buffer.from('business'), ownerPubkey.toBuffer(), digest],
      this.programId,
    );
  }

  /** Serializa un String en formato Borsh (u32 LE length prefix + bytes) */
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
   * @returns firma de la transacción confirmada
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
    const [businessPda] = this.getBusinessPda(owner, businessId);
    const discriminator = this.ixDiscriminator('registrar_negocio');

    // data = discriminator (8 bytes) + borsh string business_id
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
   * @returns firma de la transacción confirmada
   */
  async verificarNegocio(
    ownerWallet: string,
    businessId: string,
  ): Promise<string> {
    const owner = new PublicKey(ownerWallet);
    const [businessPda] = this.getBusinessPda(owner, businessId);
    const discriminator = this.ixDiscriminator('verificar_negocio');

    const data = Buffer.concat([
      discriminator,
      this.encodeString(businessId),
    ]);

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

  /**
   * PostgreSQL con columna `uuid` devuelve el id con guiones (36 bytes) aunque guardemos 32 hex.
   * Anchor/contrato usan transaction_id.as_bytes() con seed ≤ 32 bytes: UUID sin guiones.
   */
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

  /**
   * Deriva la Escrow PDA según seeds del contrato: ["escrow", buyer, transaction_id.as_bytes()]
   * Cada seed ≤ 32 bytes (Solana).
   */
  getEscrowPda(buyerPubkey: PublicKey, transactionId: string): [PublicKey, number] {
    const normalized = this.normalizeTransactionIdForEscrow(transactionId);
    const seedTx = Buffer.from(normalized, 'utf8');
    return PublicKey.findProgramAddressSync(
      [Buffer.from('escrow'), buyerPubkey.toBuffer(), seedTx],
      this.programId,
    );
  }

  /**
   * Construye la instrucción crear_escrow para que el buyer la firme.
   * El backend NO firma; Phantom firma con la wallet del buyer.
   *
   * Antes de serializar, el llamador debe asignar `feePayer` (buyer) y
   * `recentBlockhash` vía `connection.getLatestBlockhash()`.
   */
  buildCrearEscrowTransaction(
    buyerWallet: PublicKey,
    sellerWallet: PublicKey,
    transactionId: string,
    amountLamports: bigint,
  ): Transaction {
    const normalized = this.normalizeTransactionIdForEscrow(transactionId);
    const [escrowPda] = this.getEscrowPda(buyerWallet, normalized);
    const discriminator = this.ixDiscriminator('crear_escrow');

    // Borsh: u32 length + string bytes para transactionId, u64 LE para amount (mismo string que seeds)
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

  /**
   * Construye y envía liberar_escrow. El buyer debe firmar.
   * Requiere: buyer, seller, escrow con transaction_id para derivar la PDA.
   */
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

  /** Obtiene el programId para uso externo (p.ej. fetch de cuentas) */
  getProgramId(): PublicKey {
    return this.programId;
  }

  /**
   * Verifica si la Escrow PDA existe y está en estado LOCKED (1).
   * Usado por el cron para detectar pagos confirmados.
   */
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
      return status === 1; // ESCROW_LOCKED
    } catch {
      return false;
    }
  }

  /**
   * Verifica si la Escrow PDA está en estado RELEASED (2).
   */
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
      return status === 2; // ESCROW_RELEASED
    } catch {
      return false;
    }
  }
}
