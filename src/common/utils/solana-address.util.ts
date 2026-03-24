import { PublicKey } from '@solana/web3.js';

export function isValidSolanaAddress(value: string): boolean {
  try {
    new PublicKey(value.trim());
    return true;
  } catch {
    return false;
  }
}

/** Compara dos direcciones base58 (misma clave pública). */
export function solanaAddressesEqual(a: string, b: string): boolean {
  try {
    return new PublicKey(a.trim()).equals(new PublicKey(b.trim()));
  } catch {
    return false;
  }
}
