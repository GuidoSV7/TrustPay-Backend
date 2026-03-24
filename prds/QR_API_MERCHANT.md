# Plan de Integración — TrustPay QR en Plataformas Externas
Versión 2.0 | Marzo 2026

---

## 1. Resumen

TrustPay genera QR dinámicos por orden/producto que cualquier plataforma externa puede consumir via API. Cada QR usa **Transaction Request** de Solana Pay — el dinero va directo al contrato de escrow, nunca al seller directamente. Los fondos se liberan al seller solo cuando el buyer confirma la recepción o vence el plazo de auto-liberación de 7 días.

---

## 2. Flujo General

```
Plataforma externa (ecommerce, app, etc.)
        │
        ▼
Llama a TrustPay API con los datos del pago
POST /payments/qr
        │
        ▼
TrustPay genera:
  - QR con Transaction Request
  - solana:https://api.trustpay.com/tx/:paymentId
  - imagen PNG del QR
  - registro en BD con status: pending
        │
        ▼
Plataforma muestra el QR al cliente final
        │
        ▼
Cliente escanea con Phantom
        │
        ▼
Phantom llama a TrustPay y recibe la tx de crear_escrow
→ Cliente confirma y firma con Phantom
→ Dinero va DIRECTO al contrato de escrow ✅
        │
        ▼
TrustPay detecta el escrow on-chain (cron)
→ Webhook a la plataforma: escrow.locked
        │
        ▼
Seller recibe notificación → envía el producto
→ Seller marca "enviado" via API o dashboard
→ Webhook a la plataforma: escrow.shipped
→ Auto-liberación programada: shipped_at + 7 días
        │
        ├── Buyer confirma recepción (antes de 7 días)
        │   → Dinero liberado al seller ✅
        │   → Webhook: escrow.released
        │
        ├── Pasan 7 días sin confirmación
        │   → TrustPay libera automáticamente al seller ✅
        │   → Webhook: escrow.auto_released
        │
        └── Buyer abre disputa (antes de 7 días)
            → TrustPay interviene
            → Webhook: escrow.refunded | escrow.released
```

---

## 3. Autenticación

Todas las llamadas a TrustPay API requieren una **API Key** del negocio.

```
Headers:
  x-api-key: pk_live_xxx    ← publishable key (para generar QR y consultar)
  x-secret-key: sk_live_xxx ← secret key (para operaciones sensibles)
```

Las API Keys se obtienen desde el dashboard de TrustPay al crear un negocio.

---

## 4. Endpoint — Generar QR

### Request

```http
POST https://api.trustpay.com/payments/qr
x-api-key: pk_live_xxx
Content-Type: application/json

{
  "orderId": "ORDER-123",           // ID de la orden en tu plataforma
  "amount": 0.5,                    // monto en SOL
  "sellerWallet": "DsEs...k3L",    // wallet que recibe el pago al liberarse
  "webhookUrl": "https://tu-web.com/webhook/trustpay",
  "expiresInMinutes": 15,           // opcional, default 15 minutos
  "description": "Zapatos Nike #42" // opcional, se muestra en Phantom
}
```

### Response

```http
HTTP 201 Created
Content-Type: application/json

{
  "paymentId": "a0ee-bc99-...",
  "orderId": "ORDER-123",
  "amount": 0.5,
  "status": "pending",
  "qrImageBase64": "data:image/png;base64,iVBORw0KGgo...",
  "solanaPayUrl": "solana:https://api.trustpay.com/tx/a0ee-bc99-...",
  "expiresAt": "2026-03-22T14:00:00Z",
  "createdAt": "2026-03-22T13:45:00Z"
}
```

---

## 5. Endpoint — Marcar como Enviado

Una vez que el seller envía el producto, debe notificar a TrustPay para activar el contador de auto-liberación de 7 días.

```http
POST https://api.trustpay.com/payments/:paymentId/ship
x-api-key: pk_live_xxx
Content-Type: application/json

{
  "trackingNumber": "UPS-123456",  // opcional
  "note": "Enviado por DHL"        // opcional
}
```

**Response:**
```json
{
  "paymentId": "a0ee-bc99-...",
  "status": "shipped",
  "autoReleaseAt": "2026-03-29T13:50:00Z"
}
```

---

## 6. Endpoint — Consultar Estado del Pago

Para hacer polling desde el frontend de la plataforma:

```http
GET https://api.trustpay.com/payments/:paymentId
x-api-key: pk_live_xxx
```

```json
{
  "paymentId": "a0ee-bc99-...",
  "orderId": "ORDER-123",
  "status": "shipped",
  "amount": 0.5,
  "escrowPda": "GXNBGhrF5ods...",
  "autoReleaseAt": "2026-03-29T13:50:00Z",
  "createdAt": "2026-03-22T13:45:00Z"
}
```

### Estados posibles

| Estado | Descripción |
|---|---|
| `pending` | QR generado, esperando que el buyer pague |
| `escrow_locked` | Buyer pagó, dinero bloqueado en el contrato |
| `shipped` | Seller marcó el producto como enviado |
| `released` | Buyer confirmó recepción, dinero al seller |
| `auto_released` | 7 días sin confirmación, dinero liberado automáticamente |
| `disputed` | Buyer abrió disputa, TrustPay interviene |
| `refunded` | TrustPay reembolsó al buyer |
| `expired` | QR expiró sin recibir pago |

---

## 7. Webhooks — Notificaciones de Estado

Cuando ocurre un evento, TrustPay hace un `POST` a tu `webhookUrl`.

### Eventos

| Evento | Cuándo se dispara |
|---|---|
| `escrow.locked` | Buyer pagó, fondos bloqueados en el contrato |
| `escrow.shipped` | Seller marcó el producto como enviado |
| `escrow.released` | Buyer confirmó recepción, fondos al seller |
| `escrow.auto_released` | 7 días sin confirmación, fondos liberados automáticamente |
| `escrow.disputed` | Buyer abrió disputa |
| `escrow.refunded` | TrustPay reembolsó al buyer |
| `payment.expired` | QR expiró sin recibir pago |

### Payload ejemplo

```json
{
  "event": "escrow.locked",
  "paymentId": "a0ee-bc99-...",
  "orderId": "ORDER-123",
  "status": "escrow_locked",
  "amount": 0.5,
  "escrowPda": "GXNBGhrF5ods...",
  "txHash": "2QKz...ii6",
  "timestamp": "2026-03-22T13:50:00Z"
}
```

### Verificar autenticidad del webhook

TrustPay firma cada webhook con tu `secret_key`. Debes verificar la firma antes de procesar:

```javascript
const signature = req.headers['x-trustpay-signature'];
const expectedSignature = crypto
  .createHmac('sha256', YOUR_SECRET_KEY)
  .update(JSON.stringify(req.body))
  .digest('hex');

if (signature !== expectedSignature) {
  return res.status(401).send('Firma inválida');
}
```

---

## 8. Integración por Plataforma

### 8.1 Ecommerce (WooCommerce, Shopify, custom)

```
1. Cliente hace checkout
2. Tu backend llama a POST /payments/qr
3. Muestras el QR en la pantalla de pago
4. Cliente escanea con Phantom → dinero va al escrow
5. Tu backend recibe webhook escrow.locked → marca orden como "pago recibido"
6. Seller prepara y envía el producto
7. Tu backend llama a POST /payments/:id/ship
8. Tu backend recibe webhook escrow.released o escrow.auto_released → orden completada ✅
```

**Ejemplo en JavaScript:**
```javascript
// 1. Generar QR
const response = await fetch('https://api.trustpay.com/payments/qr', {
  method: 'POST',
  headers: {
    'x-api-key': 'pk_live_xxx',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    orderId: 'ORDER-123',
    amount: 0.5,
    sellerWallet: 'DsEs...k3L',
    webhookUrl: 'https://tu-web.com/webhook/trustpay',
    description: 'Zapatos Nike #42'
  })
});

const { qrImageBase64, paymentId } = await response.json();

// 2. Mostrar el QR
document.getElementById('qr').src = qrImageBase64;

// 3. Polling cada 5s para actualizar el estado en la UI
const interval = setInterval(async () => {
  const res = await fetch(`https://api.trustpay.com/payments/${paymentId}`, {
    headers: { 'x-api-key': 'pk_live_xxx' }
  });
  const { status } = await res.json();

  if (status === 'escrow_locked') {
    clearInterval(interval);
    document.getElementById('status').textContent = '✅ Pago recibido — esperando envío';
  }

  if (status === 'expired') {
    clearInterval(interval);
    alert('El QR expiró, genera uno nuevo');
  }
}, 5000);
```

**Webhook handler en tu backend:**
```javascript
app.post('/webhook/trustpay', (req, res) => {
  // 1. Verificar firma
  const signature = req.headers['x-trustpay-signature'];
  const expected = crypto
    .createHmac('sha256', process.env.TRUSTPAY_SECRET_KEY)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (signature !== expected) {
    return res.status(401).send('Firma inválida');
  }

  // 2. Responder 200 inmediatamente
  res.status(200).send('OK');

  // 3. Procesar el evento de forma asíncrona
  const { event, orderId, status } = req.body;

  switch (event) {
    case 'escrow.locked':
      // Marcar orden como "pago en escrow"
      updateOrder(orderId, { status: 'payment_held' });
      break;

    case 'escrow.shipped':
      // Marcar orden como "enviada"
      updateOrder(orderId, { status: 'shipped' });
      break;

    case 'escrow.released':
    case 'escrow.auto_released':
      // Marcar orden como completada
      updateOrder(orderId, { status: 'completed' });
      break;

    case 'escrow.refunded':
      // Marcar orden como reembolsada
      updateOrder(orderId, { status: 'refunded' });
      break;

    case 'payment.expired':
      // Marcar orden como expirada
      updateOrder(orderId, { status: 'expired' });
      break;
  }
});
```

---

### 8.2 App Móvil (React Native, Flutter)

```
1. App llama a tu backend propio
2. Tu backend llama a TrustPay API
3. App muestra el QR como imagen
4. Cliente escanea con Phantom móvil
5. Tu backend recibe webhooks y notifica a la app via push notification
```

> **Importante:** Nunca llames a TrustPay API directamente desde la app móvil — la API Key quedaría expuesta. Siempre pasa por tu backend.

---

### 8.3 WhatsApp / Redes Sociales

```
1. Vendedor genera el QR desde el dashboard de TrustPay
2. Descarga la imagen del QR
3. La comparte por WhatsApp o redes sociales
4. Comprador escanea con Phantom
5. Dinero va al escrow automáticamente
6. Vendedor envía el producto y marca "enviado" en el dashboard
7. TrustPay libera el pago al seller cuando el buyer confirma o vencen 7 días
```

---

### 8.4 Punto de Venta Físico (POS)

```
1. Cajero ingresa el monto en el dashboard de TrustPay
2. TrustPay genera el QR dinámico
3. Cliente escanea con Phantom
4. Dinero va al escrow
5. Para productos físicos entregados en el momento:
   → Cajero marca "enviado" inmediatamente
   → Si el cliente no disputa en 7 días → pago liberado automáticamente
```

> **Nota para POS:** Para entregas inmediatas en el local, considera usar un tiempo de auto-liberación más corto (ej: 24 horas en vez de 7 días).

---

## 9. Errores Comunes

| Código | Error | Solución |
|---|---|---|
| `401` | API Key inválida | Verificar que la key sea correcta y esté activa |
| `400` | Monto inválido | El monto debe ser mayor a 0 |
| `404` | Pago no encontrado | Verificar el paymentId |
| `409` | QR ya expirado | Generar un nuevo QR |
| `409` | Estado inválido | El pago no está en el estado correcto para esa operación |
| `422` | Wallet inválida | Verificar que sea una dirección Solana válida |

---

## 10. Buenas Prácticas

**Siempre verificar la firma del webhook** — no proceses pagos sin verificar que el webhook viene de TrustPay.

**Responde 200 al webhook inmediatamente** — procesa el evento de forma asíncrona y responde `200 OK` de inmediato para evitar reintentos innecesarios.

**Marca "enviado" lo antes posible** — activa el contador de auto-liberación para que el seller no espere indefinidamente.

**Maneja todos los eventos del webhook** — no solo `escrow.locked`, también `escrow.released`, `escrow.auto_released` y `payment.expired`.

**No reutilices QRs** — cada orden debe tener su propio QR. Un QR expirado o pagado no puede reutilizarse.

**Guarda el `paymentId`** — te permite consultar el estado del pago en cualquier momento y relacionarlo con tu orden.

**Para apps móviles** — nunca expongas la API Key en el cliente, siempre pasa por tu backend.

---

## 11. Ambientes

| Ambiente | Base URL | Red Solana |
|---|---|---|
| Desarrollo | `http://localhost:3001` | devnet |
| Producción | `https://api.trustpay.com` | mainnet |

Usa **devnet** para desarrollo y pruebas — el SOL es gratis y las transacciones no son reales. Phantom debe estar configurado en devnet para probar.

---

*Documentación preparada por el equipo TrustPay — Marzo 2026*