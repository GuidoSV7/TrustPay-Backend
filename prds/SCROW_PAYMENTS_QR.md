# Plan — Integración Solana Pay + Escrow
**Transaction Request Flow**
Versión 1.0 | Marzo 2026

---

## 1. Problema Actual

El QR generado actualmente usa Solana Pay en modo transferencia directa:

```
Cliente escanea QR
        │
        ▼
Dinero va DIRECTO al seller ❌
        │
        ▼
No pasa por el escrow
```

Esto elimina la propuesta de valor de TrustPay — sin escrow no hay garantía de entrega.

---

## 2. Solución — Transaction Request

Solana Pay tiene dos modos:

| Modo | Cómo funciona | Escrow |
|---|---|---|
| Transfer Request | URL con datos → transferencia directa | ❌ |
| Transaction Request | URL apunta a endpoint → backend construye la tx | ✅ |

Con **Transaction Request** el QR apunta a un endpoint de TrustPay. Phantom llama a ese endpoint, recibe la transacción de `crear_escrow` ya construida, el buyer la firma y el dinero va **directo al contrato**.

---

## 3. Flujo Completo

```
Merchant crea pago
POST /payments/qr { amount, orderId, sellerWallet, webhookUrl }
        │
        ▼
TrustPay genera:
  ├── transaction_id (UUID → también es la referencia del escrow)
  ├── QR apuntando a: solana:https://api.trustpay.com/tx/:paymentId
  └── Guarda en BD con status: pending
        │
        ▼
Cliente escanea QR con Phantom
        │
        ▼
Phantom hace GET /tx/:paymentId
  ← TrustPay responde con: label, icon
        │
        ▼
Phantom hace POST /tx/:paymentId { account: buyerWallet }
  ← TrustPay construye la tx de crear_escrow y la devuelve serializada
        │
        ▼
Phantom muestra al buyer:
"Pagar X SOL — protegido por TrustPay"
        │
        ▼
Buyer confirma y firma con Phantom
        │
        ▼
Dinero va DIRECTO a la Escrow PDA ✅
(nunca toca la wallet de TrustPay)
        │
        ▼
TrustPay detecta el pago on-chain (cron)
        │
        ▼
TrustPay actualiza BD → status: escrow_locked
        │
        ▼
TrustPay dispara webhook al merchant
{ orderId, status: "escrow_locked", tx }
        │
        ▼
Seller recibe notificación → envía el producto
        │
        ▼
Buyer confirma recepción en la app/web
        │
        ▼
TrustPay llama a liberar_escrow en el contrato
        │
        ▼
Dinero va al seller ✅
        │
        ▼
TrustPay dispara webhook al merchant
{ orderId, status: "released", tx }
```

---

## 4. Estados del Pago

```
pending        → QR generado, esperando que el buyer pague
escrow_locked  → Buyer pagó, dinero bloqueado en el contrato
released       → Buyer confirmó, dinero liberado al seller
refunded       → TrustPay reembolsó al buyer (disputa)
expired        → QR expiró sin recibir pago
```

---

## 5. Endpoints Nuevos

### 5.1 GET /tx/:paymentId
Phantom llama a este endpoint primero para mostrar la info del pago al buyer.

**Request:**
```http
GET https://api.trustpay.com/tx/:paymentId
```

**Response:**
```json
{
  "label": "Mi Tienda",
  "icon": "https://mi-tienda.com/logo.png"
}
```

---

### 5.2 POST /tx/:paymentId
Phantom llama a este endpoint para obtener la transacción construida.

**Request:**
```http
POST https://api.trustpay.com/tx/:paymentId
Content-Type: application/json

{
  "account": "DsEsQrgishAtgESiNZ64BkEURzRWT75Qqmi9aJKc1k3L"
}
```

El campo `account` es la **wallet del buyer** — Phantom la manda automáticamente.

**Response:**
```json
{
  "transaction": "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAQADBg...",
  "message": "Pago protegido por TrustPay — Zapatillas Nike #42"
}
```

El campo `transaction` es la transacción de `crear_escrow` serializada en Base64, lista para que Phantom la presente al buyer y la firme.

---

### 5.3 Cambio en el QR generado

```typescript
// ❌ Antes — Transfer Request (transferencia directa)
const url = encodeURL({
  recipient: sellerWallet,
  amount: lamportsToSol(amountLamports),
  label: businessName,
});

// ✅ Ahora — Transaction Request (llama al backend)
const url = encodeURL({
  link: new URL(`https://api.trustpay.com/tx/${paymentId}`)
});
```

---

## 6. Construcción de la Transacción

El endpoint `POST /tx/:paymentId` debe construir la transacción de `crear_escrow` usando Anchor:

```
1. Recibir buyerWallet del body
2. Buscar el payment en BD por paymentId
3. Derivar la Escrow PDA con los seeds correctos
4. Construir la instrucción crear_escrow con Anchor
5. Serializar la transacción
6. Devolverla en Base64
```

### Seeds de la Escrow PDA
```typescript
const [escrowPda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("escrow"),
    buyerWallet.toBuffer(),
    Buffer.from(payment.transactionId), // UUID del payment
  ],
  PROGRAM_ID
);
```

### La transacción construida incluye:
- Instrucción `crear_escrow` del contrato TrustPay
- Cuentas: buyer, seller, escrowPda, systemProgram
- El buyer como firmante (Phantom firma por él)

---

## 7. Detección del Pago On-Chain

Una vez el buyer firma, TrustPay necesita detectar que el escrow fue creado. El cron actual busca la Escrow PDA directamente:

```
Cron cada 30s (o menos)
  → Para cada payment con status: pending
  → Intenta leer la Escrow PDA de Solana
  → Si existe y status = LOCKED → pago confirmado
  → Actualizar BD → status: escrow_locked
  → Disparar webhook al merchant
```

### Ventaja vs el flujo anterior
Con Transfer Request buscabas una transacción por `reference`. Con Transaction Request puedes verificar **directamente si la PDA existe** — más confiable y simple.

```typescript
// Verificar si el escrow fue creado
const escrowAccount = await program.account.escrowPda.fetchNullable(escrowPda);

if (escrowAccount && escrowAccount.status === 1) { // LOCKED
  // pago confirmado ✅
}
```

---

## 8. Confirmar Recepción — Buyer

Cuando el buyer confirma que recibió el producto, TrustPay llama a `liberar_escrow`:

**Endpoint:**
```http
POST /payments/:paymentId/confirm
Authorization: Bearer <jwt del buyer>
```

**Lo que hace TrustPay:**
```
1. Verifica que el buyer es el dueño del escrow
2. Llama a liberar_escrow en el contrato
3. El contrato transfiere los fondos al seller
4. TrustPay actualiza BD → status: released
5. Dispara webhook al merchant
```

---

## 9. Tabla payments — Campos Actualizados

```sql
CREATE TABLE payments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id         UUID NOT NULL REFERENCES businesses(id),
    order_id            VARCHAR(255),
    seller_wallet       VARCHAR(255) NOT NULL,
    amount_lamports     BIGINT NOT NULL,
    token_mint          VARCHAR(255),           -- null = SOL
    webhook_url         TEXT,
    description         TEXT,
    status              VARCHAR(20) DEFAULT 'pending',
    -- pending | escrow_locked | released | refunded | expired
    escrow_pda          VARCHAR(255),           -- dirección de la PDA on-chain
    blockchain_tx_create    VARCHAR(255),       -- tx de crear_escrow
    blockchain_tx_release   VARCHAR(255),       -- tx de liberar_escrow
    blockchain_tx_refund    VARCHAR(255),       -- tx de reembolsar_escrow
    expires_at          TIMESTAMPTZ,
    paid_at             TIMESTAMPTZ,
    released_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 10. Webhooks al Merchant

| Evento | Cuándo se dispara |
|---|---|
| `escrow.locked` | Buyer pagó, fondos bloqueados en el contrato |
| `escrow.released` | Buyer confirmó recepción, fondos al seller |
| `escrow.refunded` | TrustPay reembolsó al buyer |
| `payment.expired` | QR expiró sin pago |

**Payload ejemplo:**
```json
{
  "event": "escrow.locked",
  "paymentId": "a0ee-bc99-...",
  "orderId": "ORDER-123",
  "status": "escrow_locked",
  "amount": 0.5,
  "escrowPda": "GXNBGhrF5ods...",
  "txHash": "2QKz...ii6",
  "paidAt": "2026-03-22T13:50:00Z"
}
```

---

## 11. Orden de Implementación

```
1. Instalar @solana/pay en el backend
        │
        ▼
2. Cambiar la generación del QR
   encodeURL con link en vez de recipient
        │
        ▼
3. Crear GET /tx/:paymentId
   → devuelve label e icon
        │
        ▼
4. Crear POST /tx/:paymentId
   → construye y devuelve la tx de crear_escrow
        │
        ▼
5. Actualizar el cron
   → buscar la Escrow PDA directamente en vez de buscar por reference
        │
        ▼
6. Crear POST /payments/:paymentId/confirm
   → llama a liberar_escrow
        │
        ▼
7. Probar flujo completo en devnet con Phantom
```

---

## 12. Dependencias

```bash
npm install @solana/pay @solana/web3.js @coral-xyz/anchor
```

---

## 13. Consideraciones de Seguridad

**El dinero nunca toca la wallet de TrustPay** — va directo del buyer al contrato de escrow. TrustPay solo construye la transacción, el buyer la firma.

**Verificar siempre que el payment existe y está pending** antes de construir la transacción — evita que se creen escrows duplicados.

**El buyer no puede confirmar recepción sin JWT** — el endpoint `/confirm` requiere autenticación.

**Los webhooks se firman con HMAC** — el merchant debe verificar la firma antes de procesar.

---

*Plan preparado por el equipo TrustPay — Marzo 2026*