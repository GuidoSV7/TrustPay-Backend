# Solana Pay — QR generado en backend (Opción A)

## Resumen

- El **frontend no envía** `solana_pay_url` ni `qr_image_url` al crear o actualizar datos de pago del QR.
- El backend genera la **URL Solana Pay** (`encodeURL` de `@solana-commerce/solana-pay`) y la **imagen QR** (data URL SVG vía `createQRDataURL`).
- Lo guardado en `qr_codes` coincide con lo codificado en el QR (misma URL).
- **Requisito:** el negocio debe estar **`is_verified === true`** (verificado on-chain) para crear o para cambiar `label` / `amountLamports` / `tokenMint` en un QR existente.
- **Solo SOL nativo:** los pagos en **tokens SPL** (USDC, etc.) están **deshabilitados** por ahora; el campo `tokenMint` debe ir vacío o `null`. Se habilitará más adelante.

## Dependencias

- `@solana-commerce/solana-pay` (beta; APIs pueden cambiar).
- Cada QR incluye una **`reference`** nueva (pubkey) para correlacionar pagos.

## Montos (SOL)

- `amountLamports`: unidades atómicas (**lamports**). Si se omite o es null, el monto es **libre** en la billetera.

### SPL / `tokenMint` (futuro)

- Reservado para una versión posterior. Hoy **no** enviar mint; el API rechaza valores no vacíos en `tokenMint`.

## Endpoints

- **Listar QRs por negocio (paginado):** `GET /businesses/:businessId/qr-codes?page=1&limit=10` — mismo resultado que el alias siguiente.
- **Alias:** `GET /businesses/:businessId/qrs?page=1&limit=10` — JWT requerido; solo el dueño del negocio (o admin según reglas del servicio).
- `GET /businesses/:businessId/qr-codes/:id` — un QR por id.
- `POST /businesses/:businessId/qr-codes` — body: `label`, `type`, `amountLamports?`, `tokenMint?` (debe ser null/vacío; solo SOL).
- `PATCH .../qr-codes/:id` — si se modifican campos de pago, se regeneran URL e imagen (mismas reglas de verificación).

## Confirmación de pago, tabla `transactions` y webhooks

- Cada QR guarda **`reference_pubkey`** (pubkey usada como `reference` en la URL) para correlacionar on-chain.
- Un **cron** (cada 30 s, `PAYMENT_POLL_ENABLED`) lista firmas con `getSignaturesForAddress(reference)` y valida cada una con **`validateTransfer`** (`@solana/pay`).
- **Tabla `transactions`:** una fila por transacción confirmada (`signature` única). Incluye `business_id`, `qr_code_id`, `amount_lamports` / `token_mint` copiados del QR (monto fijo; null si monto abierto), `slot`, `confirmed_at`. El esquema se define en la entidad TypeORM (`Transaction`); con `TYPEORM_SYNCHRONIZE=true` (o equivalente en dev) la BD se alinea automáticamente. En producción con `synchronize: false`, usar migraciones TypeORM o SQL manual.
- **`qr_codes`:** el **primer** pago válido sigue actualizando `payment_confirmed_at` / `payment_signature` y dispara **una vez** el webhook `payment.confirmed`. Los pagos siguientes al mismo QR solo se guardan en `transactions`.
- **API métricas:** `GET /businesses/:businessId/transactions` (paginado, incluye `amountSol` con el monto en SOL), `GET /businesses/:businessId/transactions/summary` (totales y serie por día), `GET /transactions` (todas las transacciones visibles para el usuario / admin).
- QRs sin `reference_pubkey`: la columna viene de la entidad `QrCode`; con sincronización TypeORM activa se añade sola. Regenerar el QR (PATCH o crear de nuevo) si hace falta.

## Dependencias adicionales

- `@solana/pay` — verificación de transferencias Solana Pay.
- `@nestjs/schedule` — cron de sondeo.
