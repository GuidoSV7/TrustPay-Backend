# Phantom no deja pagar al escanear el QR

## Causa habitual

El QR apunta a `https://localhost:3001/tx/...` (o `http://localhost` convertido a `https`). **Phantom no puede conectar con localhost**:

- **Móvil**: `localhost` = el propio teléfono, no tu PC.
- **Desktop**: el servidor escucha en HTTP (puerto 3001), no en HTTPS; Phantom intenta `https://localhost:3001` y falla.

## ⚠️ ngrok plan gratuito no funciona con Phantom

El plan gratuito de ngrok muestra una página HTML ("You are about to visit...") en vez de reenviar la petición. Phantom espera JSON y falla con «no hemos podido cargar esta solicitud». **Usa Cloudflare Tunnel en su lugar**.

---

## Solución recomendada: Cloudflare Tunnel (cloudflared)

Sin página intermedia, gratuito:

1. **Instala cloudflared**  
   https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/

   O con npm: `npm i -g cloudflared` (si está disponible)

2. **Inicia el túnel** (backend corriendo en 3001):
   ```bash
   cloudflared tunnel --url http://localhost:3001
   ```

3. **Copia la URL** que aparece, p. ej. `https://xyz-abc.trycloudflare.com`

4. **Configura** en `.env`:
   ```env
   API_BASE_URL=https://xyz-abc.trycloudflare.com
   CORS_ORIGIN=http://localhost:3000,https://xyz-abc.trycloudflare.com
   ```

5. **Reinicia el backend** y crea un pago nuevo.

---

## Alternativa: ngrok plan de pago

Si usas ngrok de pago, puedes desactivar la página de advertencia en el dashboard. El plan gratuito no lo permite.

---

## Comprobar que la API responde

```bash
# Sustituye TUNNEL_URL y PAYMENT_ID
curl https://TU_TUNNEL_URL/tx/PAYMENT_ID
```

Debe devolver JSON `{"label":"...","icon":"..."}`. Si ves HTML, el túnel no está bien configurado.

---

## La API responde OK pero Phantom falla al pulsar «Confirmar» / «Aprobar»

Si en el servidor ves `POST /tx/... 201` y `tx base64 length=...` pero en el móvil aparece error al firmar:

### 1. Red distinta (muy habitual)

El backend usa el RPC de `SOLANA_RPC_URL` en `.env` (p. ej. **devnet**). Phantom debe estar en **la misma red**:

- En Phantom: **Ajustes → Red de Solana → Devnet** (si tu backend apunta a devnet).
- Si Phantom está en **Mainnet** y el programa está desplegado solo en **devnet**, la simulación falla (programa inexistente o cuenta incorrecta).

### 2. SOL insuficiente (devnet)

El comprador paga el monto del escrow + **rent** de la nueva cuenta PDA + **comisión** de la transacción. En devnet pide SOL en un grifo: [Solana Faucet](https://faucet.solana.com/).

### 3. Ver el error real en los logs del backend

Tras un `POST /tx/...`, el backend intenta **simular** la misma transacción. Si falla, verás líneas como:

`[Phantom] Simulación crear_escrow falló ...` y `Logs programa: ...`

Copia ese mensaje para depurar (instrucción rechazada, saldo, etc.).

### 4. `SOLANA_PROGRAM_ID` debe coincidir con el programa desplegado

El ID del programa en `.env` tiene que ser el del **mismo cluster** (devnet/mainnet) que usa Phantom.
