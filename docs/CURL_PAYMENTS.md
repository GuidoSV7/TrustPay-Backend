# Pruebas con cURL — Flujo de pagos con escrow

Base URL: `http://localhost:3001` (o tu `API_BASE_URL`).

**Phantom no paga al escanear el QR?** El QR apunta a tu backend; si usas `localhost`, Phantom (sobre todo en móvil) no puede conectar. Usa [ngrok](PHANTOM_QR_TROUBLESHOOTING.md) y configura `API_BASE_URL` con la URL HTTPS del túnel.

**Métricas escrow y comisión (admin/merchant):** ver [METRICS.md](METRICS.md).

**Admin — listar / deshabilitar API keys (escrow):** ver [ADMIN_API_KEYS.md](ADMIN_API_KEYS.md).

---

## 1. Obtener JWT (login)

```bash
# Login (ajusta email/password)
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"tu@email.com","password":"tu-password"}'
```

Guarda el `access_token` de la respuesta.

---

## 2. Crear API Key (para plataformas externas)

Necesitas un negocio creado y verificado. Luego:

```bash
# Crear API key (JWT requerido)
curl -X POST "http://localhost:3001/businesses/TU_BUSINESS_ID/api-keys" \
  -H "Authorization: Bearer TU_JWT" \
  -H "Content-Type: application/json" \
  -d '{"network":"devnet","name":"Test key"}'
```

Guarda `publishableKey` (pk_xxx) y `secretKey` (sk_xxx). El secretKey solo se muestra una vez.

---

## 3. Crear pago con QR (API Key)

```bash
# Sustituye TU_PK y TU_SK por tu publishableKey y secretKey
# Sustituye SELLER_WALLET por la wallet del vendedor (ej: tu wallet de Phantom devnet)
curl -X POST http://localhost:3001/api/payments/qr \
  -H "Content-Type: application/json" \
  -H "x-api-key: pk_devnet_XXXXXXXX" \
  -H "x-secret-key: sk_devnet_YYYYYYYY" \
  -d '{
    "orderId": "ORDER-001",
    "amount": 0.01,
    "sellerWallet": "TuWalletSolanaBase58...",
    "webhookUrl": "https://webhook.site/tu-id",
    "expiresInMinutes": 15,
    "description": "Prueba de pago"
  }'
```

O con JWT (dashboard):

```bash
# Sustituye TU_BUSINESS_ID y TU_JWT
# sellerWallet se omite — usa la wallet del negocio
curl -X POST "http://localhost:3001/businesses/TU_BUSINESS_ID/payments/qr" \
  -H "Authorization: Bearer TU_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ORDER-002",
    "amount": 0.01,
    "webhookUrl": "https://webhook.site/tu-id",
    "expiresInMinutes": 15,
    "description": "Prueba desde dashboard"
  }'
```

Guarda el `paymentId` de la respuesta.

---

## 4. Endpoints que Phantom llama (públicos)

```bash
# GET — Phantom obtiene label e icon
curl http://localhost:3001/tx/PAYMENT_ID

# POST — Phantom obtiene la transacción crear_escrow
# account = wallet del buyer (Phantom la envía)
curl -X POST http://localhost:3001/tx/PAYMENT_ID \
  -H "Content-Type: application/json" \
  -d '{"account":"WALLET_DEL_BUYER_BASE58"}'
```

---

## 5. Consultar estado del pago

```bash
# Con API Key (merchant)
curl "http://localhost:3001/api/payments/PAYMENT_ID" \
  -H "x-api-key: pk_devnet_XXXXXXXX" \
  -H "x-secret-key: sk_devnet_YYYYYYYY"

# Público (solo status, para polling del comprador)
curl "http://localhost:3001/payments/PAYMENT_ID/status"
```

---

## 6. Marcar como enviado (seller)

```bash
# Con API Key
curl -X POST "http://localhost:3001/api/payments/PAYMENT_ID/ship" \
  -H "Content-Type: application/json" \
  -H "x-api-key: pk_devnet_XXXXXXXX" \
  -H "x-secret-key: sk_devnet_YYYYYYYY" \
  -d '{"trackingNumber":"UPS-123","note":"Enviado por DHL"}'

# O con JWT
curl -X POST "http://localhost:3001/businesses/BUSINESS_ID/payments/PAYMENT_ID/ship" \
  -H "Authorization: Bearer TU_JWT" \
  -H "Content-Type: application/json" \
  -d '{"trackingNumber":"UPS-123"}'
```

---

## 7. Confirmar recepción (buyer, libera escrow)

Público. El comprador es cualquier persona con Phantom; no requiere registro.  
El `account` debe coincidir con la wallet que pagó (buyerWallet del pago).

```bash
curl -X POST "http://localhost:3001/api/payments/PAYMENT_ID/confirm" \
  -H "Content-Type: application/json" \
  -d '{"account":"WALLET_DEL_COMPRADOR_BASE58"}'
```

Devuelve `{ transaction: "base64...", message: "..." }` — el frontend deserializa, firma con Phantom y envía a Solana.

---

## Flujo de prueba completo

1. Crea un pago: `POST /api/payments/qr` o `POST /businesses/:id/payments/qr`
2. Escanea el QR con Phantom (devnet) o simula: `GET /tx/:id` y `POST /tx/:id`
3. Phantom firma — el cron detecta el escrow en ~30s → `escrow_locked`
4. Marca enviado: `POST /api/payments/:id/ship`
5. El comprador (cualquiera con Phantom) llama `POST /api/payments/:id/confirm` con `{ account: "wallet" }` → obtiene tx para firmar con Phantom
6. Tras firmar y enviar la tx, el cron detecta la liberación → `released`
