# Métricas escrow y comisión

Las métricas usan **solo** la tabla `payments` (flujo escrow + QR Solana Pay), no la tabla `transactions` (QR estáticos).

## Guía rápida (cURL)

Reemplaza `{{base}}`, `{{admin_token}}`, `{{merchant_token}}`, etc. (sin `export`).

```bash
# Login admin → copia access_token como {{admin_token}}
curl -s -X POST "{{base}}/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@trustpay.app","password":"123456"}'

# Login merchant → copia access_token como {{merchant_token}}
curl -s -X POST "{{base}}/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"merchant@trustpay.app","password":"123456"}'

# --- Admin: comisión ---
curl -s -H "Authorization: Bearer {{admin_token}}" "{{base}}/admin/settings/commission"
curl -s -X PATCH -H "Authorization: Bearer {{admin_token}}" -H "Content-Type: application/json" \
  -d '{"commissionBps":250}' "{{base}}/admin/settings/commission"

# --- Admin: merchants (volumen, comisión estimada) ---
curl -s -H "Authorization: Bearer {{admin_token}}" \
  "{{base}}/admin/metrics/merchants/payments?page=1&limit=20&sort=count"
curl -s -H "Authorization: Bearer {{admin_token}}" \
  "{{base}}/admin/metrics/merchants/payments?sort=volume&from={{from}}"

# --- Admin: serie temporal (pagos escrow por día o semana) ---
# Por defecto: groupBy=day, buckets=14. Semana: groupBy=week&buckets=4
curl -s -H "Authorization: Bearer {{admin_token}}" \
  "{{base}}/admin/metrics/payments/timeseries?groupBy=day&buckets=14"
curl -s -H "Authorization: Bearer {{admin_token}}" \
  "{{base}}/admin/metrics/payments/timeseries?groupBy=week&buckets=4"

# --- Admin: distribución de merchants (terciles de volumen + sin pagos) ---
curl -s -H "Authorization: Bearer {{admin_token}}" \
  "{{base}}/admin/metrics/merchants/distribution"

# --- Merchant: ranking por negocio ---
curl -s -H "Authorization: Bearer {{merchant_token}}" \
  "{{base}}/metrics/my-businesses/payments?sort=count"
curl -s -H "Authorization: Bearer {{merchant_token}}" \
  "{{base}}/metrics/my-businesses/payments?sort=volume"
curl -s -H "Authorization: Bearer {{merchant_token}}" \
  "{{base}}/metrics/my-businesses/payments?from={{from}}&to={{to}}"

# --- Merchant: SOL aún en escrow (no cobrado) ---
curl -s -H "Authorization: Bearer {{merchant_token}}" \
  "{{base}}/metrics/my-businesses/escrow-locked"
curl -s -H "Authorization: Bearer {{merchant_token}}" \
  "{{base}}/metrics/my-businesses/escrow-locked?businessId={{business_id}}"
```

**Ejemplo de valores:** `{{base}}` = `http://localhost:3001`, `{{from}}` / `{{to}}` = `2026-03-01T00:00:00.000Z` y `2026-03-31T23:59:59.999Z`, `{{business_id}}` = UUID de tu negocio.

**Nota:** Usuarios de seed (`admin@` / `merchant@`) existen tras ejecutar `POST /seed` si corresponde.

## Estados incluidos en volumen y recuento

`escrow_locked`, `shipped`, `released`, `auto_released`, `disputed`.

## Filtro de fechas

Opcional `from` y `to` (ISO 8601 con offset, p. ej. `2026-03-01T00:00:00.000Z`). Se filtra por `COALESCE(paid_at, created_at)`.

## Comisión (estimada)

- Configuración global en **basis points** (bps): `100` = 1%, `10000` = 100%.
- Por cada pago incluido: `floor(amount_lamports * commission_bps / 10000)` y se suma.
- Es **estimación contable** según la tasa configurada; no implica cobro on-chain automático.

---

## Admin: leer / actualizar comisión

```bash
# Ver tasa actual
curl -s -H "Authorization: Bearer TOKEN" \
  http://localhost:3001/admin/settings/commission

# Fijar comisión al 2.5% (250 bps)
curl -s -X PATCH -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"commissionBps":250}' \
  http://localhost:3001/admin/settings/commission
```

---

## Merchant: dinero aún en escrow (no cobrado como vendedor)

Suma de pagos en estados donde el SOL sigue en la PDA de escrow: `escrow_locked`, `shipped`, `disputed` (no incluye `released` / `auto_released`).

```bash
# Total de todos tus negocios + desglose
curl -s -H "Authorization: Bearer TOKEN" \
  http://localhost:3001/metrics/my-businesses/escrow-locked

# Solo un negocio (UUID debe ser tuyo)
curl -s -H "Authorization: Bearer TOKEN" \
  "http://localhost:3001/metrics/my-businesses/escrow-locked?businessId=UUID_NEGOCIO"
```

Respuesta: `totalLockedLamports`, `totalLockedSol`, `paymentCount`, `byBusiness[]`, `statusesIncluded`.

---

## Merchant: ranking de sus negocios por pagos escrow

```bash
curl -s -H "Authorization: Bearer TOKEN" \
  "http://localhost:3001/metrics/my-businesses/payments?sort=count"

# Por volumen (lamports)
curl -s -H "Authorization: Bearer TOKEN" \
  "http://localhost:3001/metrics/my-businesses/payments?sort=volume"

# Rango de fechas
curl -s -H "Authorization: Bearer TOKEN" \
  "http://localhost:3001/metrics/my-businesses/payments?from=2026-03-01T00:00:00.000Z&to=2026-03-31T23:59:59.999Z"
```

Respuesta: `{ "data": [ { "businessId", "businessName", "paymentCount", "volumeLamports", "volumeSol" } ] }`.

---

## Admin: merchants con más pagos y comisión estimada

```bash
curl -s -H "Authorization: Bearer TOKEN" \
  "http://localhost:3001/admin/metrics/merchants/payments?page=1&limit=20&sort=count"

curl -s -H "Authorization: Bearer TOKEN" \
  "http://localhost:3001/admin/metrics/merchants/payments?sort=volume&from=2026-03-01T00:00:00.000Z"
```

Respuesta incluye `commissionBps` (tasa aplicada al calcular), `data[]` con `userId`, `email`, `totalPayments`, `volumeLamports`, `volumeSol`, `estimatedCommissionLamports`, `estimatedCommissionSol`, `businessCount`, y paginación estándar.
