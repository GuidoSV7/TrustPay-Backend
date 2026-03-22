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

  // ─── helpers ──────────────────────────────────────────────────────────────

  /** Calcula el discriminador de instrucción: sha256("global:<name>")[0..8] */
  private ixDiscriminator(name: string): Buffer {
    return Buffer.from(
      crypto.createHash('sha256').update(`global:${name}`).digest(),
    ).subarray(0, 8);
  }

  /** Deriva la Business PDA de un owner wallet */
  private getBusinessPda(ownerPubkey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('business'), ownerPubkey.toBuffer()],
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
    const [businessPda] = this.getBusinessPda(owner);
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
  async verificarNegocio(ownerWallet: string): Promise<string> {
    const owner = new PublicKey(ownerWallet);
    const [businessPda] = this.getBusinessPda(owner);
    const discriminator = this.ixDiscriminator('verificar_negocio');

    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: this.authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: owner, isSigner: false, isWritable: false },
        { pubkey: businessPda, isSigner: false, isWritable: true },
      ],
      data: discriminator,
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
        `verificar_negocio OK | wallet: ${ownerWallet} | tx: ${signature}`,
      );
      return signature;
    } catch (err) {
      this.logger.error(`verificar_negocio FAILED | wallet: ${ownerWallet}`, err);
      throw new InternalServerErrorException(
        `No se pudo verificar el negocio en la blockchain: ${(err as Error).message}`,
      );
    }
  }
}
