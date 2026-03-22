# Solana Pay — QR generado en backend (Opción A)

## Resumen

- El **frontend no envía** `solana_pay_url` ni `qr_image_url` al crear o actualizar datos de pago del QR.
- El backend genera la **URL Solana Pay** (`encodeURL` de `@solana-commerce/solana-pay`) y la **imagen QR** (data URL SVG vía `createQRDataURL`).
- Lo guardado en `qr_codes` coincide con lo codificado en el QR (misma URL).
- **Requisito:** el negocio debe estar **`is_verified === true`** (verificado on-chain) para crear o para cambiar `label` / `amountLamports` / `tokenMint` en un QR existente.

## Dependencias

- `@solana-commerce/solana-pay` (beta; APIs pueden cambiar).
- Cada QR incluye una **`reference`** nueva (pubkey) para correlacionar pagos.

## Montos y SPL

- `amountLamports`: unidades atómicas (lamports para SOL). Si se omite o es null, el monto es **libre** en la billetera.
- Pagos **SPL**: el campo `tokenMint` puede indicar el mint; la codificación de `amount` en URL sigue las reglas de la librería (principalmente orientada a SOL). Validar en entorno real para tokens con decimales distintos de 9.

## Endpoints

- **Listar QRs por negocio (paginado):** `GET /businesses/:businessId/qr-codes?page=1&limit=10` — mismo resultado que el alias siguiente.
- **Alias:** `GET /businesses/:businessId/qrs?page=1&limit=10` — JWT requerido; solo el dueño del negocio (o admin según reglas del servicio).
- `GET /businesses/:businessId/qr-codes/:id` — un QR por id.
- `POST /businesses/:businessId/qr-codes` — body: `label`, `type`, `amountLamports?`, `tokenMint?`.
- `PATCH .../qr-codes/:id` — si se modifican campos de pago, se regeneran URL e imagen (mismas reglas de verificación).

## Confirmación de pago y webhooks al comercio

- Cada QR guarda **`reference_pubkey`** (pubkey usada como `reference` en la URL) para correlacionar on-chain.
- Un **cron** (cada 30 s, configurable con `PAYMENT_POLL_ENABLED`) usa `@solana/pay` (`findReference` + `validateTransfer`) contra `SOLANA_RPC_URL`.
- **MVP:** solo se registra y notifica el **primer** pago válido por QR (`payment_confirmed_at`, `payment_signature`). Pagos posteriores con el mismo QR no generan otro evento (fase 2: tabla de eventos por firma).
- Los comercios reciben el evento **`payment.confirmed`** en sus [webhooks](../src/webhooks/) si el endpoint tiene suscripción a ese `event_type`. Payload sugerido: `qrCodeId`, `businessId`, `signature`, `referencePubkey`, `amountLamports`, `tokenMint`, `confirmedAt`.
- QRs antiguos sin `reference_pubkey` en BD: ejecutar `sql/add_qr_payment_columns.sql` y, si hace falta, rellenar `reference` parseando `solana_pay_url` o regenerar el QR con PATCH.

## Dependencias adicionales

- `@solana/pay` — verificación de transferencias Solana Pay.
- `@nestjs/schedule` — cron de sondeo.
