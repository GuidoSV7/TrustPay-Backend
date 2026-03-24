const DEFAULT_ORIGIN = 'http://localhost:3000';

/**
 * Convierte `CORS_ORIGIN` del .env en uno o varios orígenes permitidos.
 * Varios orígenes: lista separada por comas (sin espacios obligatorios; se hace trim).
 *
 * @example
 * CORS_ORIGIN=http://localhost:3000
 * CORS_ORIGIN=http://localhost:3000,http://localhost:5173,https://app.midominio.com
 */
export function parseCorsOrigins(raw: string | undefined): string | string[] | true {
  if (!raw?.trim()) {
    return DEFAULT_ORIGIN;
  }
  const trimmed = raw.trim();
  // Permitir todo (útil para Phantom en dev con ngrok)
  if (trimmed === '*' || trimmed.toLowerCase() === 'true') {
    return true;
  }
  const parts = trimmed
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) {
    return DEFAULT_ORIGIN;
  }
  if (parts.length === 1) {
    return parts[0]!;
  }
  return parts;
}
