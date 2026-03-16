# PRD: Técnicas Antihacking (Remediación Pentest)

**Versión:** 1.0  
**Fecha:** 2026-01-23  
**Origen:** Informe de penetración / Plan de remediación de vulnerabilidades

---

## 1. Resumen Ejecutivo

Este documento describe las **técnicas antihacking** implementadas como resultado de la remediación del informe de penetración. Incluye validación estricta de autenticación 2FA, corrección de respuestas de error que revelaban información, rate limiting, prevención de XSS en URLs de configuración, autorización basada en servidor (no en storage del cliente) y reducción de exposición de datos en APIs públicas.

---

## 2. Objetivos

- **Cerrar bypass de autenticación** en el flujo de login con 2FA.
- **Evitar IDOR y fugas de información** en respuestas de error (500 → 403).
- **Mitigar fuerza bruta y abuso** en endpoints de auth y recuperación de contraseña.
- **Prevenir XSS** por inyección de URLs maliciosas en configuración de logo.
- **Impedir elevación de privilegios por manipulación de cliente** (rol admin desde servidor).
- **Reducir superficie de ataque** en APIs públicas (listados sin datos sensibles innecesarios).

---

## 3. Alcance

### 3.1 Incluido
- Backend: Auth, Users, SystemConfig, Products, ProductPrices, App (Throttler), GoogleAuthenticator.
- Frontend: MainNav, UserProfileDropdown, layout admin, useLogo, layout (metadata), sanitizeLogoUrl.
- DTOs y contratos públicos de productos y precios.

### 3.2 Excluido
- Rate limiting en `verify-login` (recomendado, no implementado).
- Ofuscación de stock (`hasStock` vs `stock`): opción documentada; la decisión de producto actual es exponer `stock`.
- Ocultar IDs en listados públicos.
- Logging/auditoría (recomendación de medio plazo).

---

## 4. Técnicas Implementadas

---

### 4.1 Validación TOTP en `login-complete` (VULN-01)

**Problema:**  
`POST /auth/login-complete` emitía JWT usando solo `email`; el `code` TOTP no se validaba en servidor. Un atacante podía obtener sesión con `{ email, code: "000000" }`.

**Técnica:**  
Validar el código TOTP en servidor **antes** de emitir cualquier token. La fuente de verdad del rol es siempre la entidad `User` en base de datos, nunca el body.

**Implementación:**

| Ubicación | Cambio |
|-----------|--------|
| `AuthModule` | Importar `GoogleAuthenticatorModule` e inyectar `GoogleAuthenticatorService` en `AuthService`. |
| `AuthService.loginWithGoogleAuth` | Llamar a `GoogleAuthenticatorService.verifyTotpByEmail(email, code)` antes de generar el JWT. Si `valid !== true`, lanzar `UnauthorizedException('Código de Google Authenticator inválido')`. |
| `AuthController.loginComplete` | Body restringido a `{ email: string; code: string }`. No aceptar `user` ni `role`. |

**Archivos:**  
`backend/src/auth/auth.module.ts`, `backend/src/auth/auth.service.ts`, `backend/src/auth/auth.controller.ts`.

---

### 4.2 Respuestas 403 en lugar de 500 en control de acceso (VULN-02 / IDOR)

**Problema:**  
En `GET /users/:id`, `PATCH /users/:id` y `DELETE /users/:id`, ante falta de autorización se usaba `throw new Error('No autorizado')`. Nest lo convierte en 500, lo que puede revelar detalles internos y difumina la causa real (acceso prohibido).

**Técnica:**  
Usar excepciones HTTP apropiadas: `ForbiddenException` (403) para “no autorizado” en lógica de negocio. Así se evita confundir con fallos de servidor y se da una señal clara al cliente.

**Implementación:**

| Ruta | Condición de denegación | Cambio |
|------|-------------------------|--------|
| `GET /users/:id` | `currentUser.id !== id && currentUser.role !== UserRole.ADMIN` | `throw new ForbiddenException('No autorizado')` |
| `PATCH /users/:id` | Misma condición | `throw new ForbiddenException('No autorizado')` |
| `DELETE /users/:id` | `currentUser.id !== id` | `throw new ForbiddenException('No autorizado')` |

**Archivos:**  
`backend/src/users/users.controller.ts` (importar `ForbiddenException` de `@nestjs/common`).

---

### 4.3 Rate limiting (Throttler)

**Problema:**  
Sin límites de peticiones en login, login-complete, registro y recuperación de contraseña, se facilitan ataques de fuerza bruta y abuso de recursos.

**Técnica:**  
Límite global por defecto y límites más estrictos en endpoints sensibles. Los rechazos se responden con 429 (Too Many Requests).

**Implementación:**

| Componente | Configuración |
|------------|---------------|
| `AppModule` | `ThrottlerModule.forRoot([{ ttl: 60000, limit: 20 }])` — 20 peticiones / 60 s por IP por defecto. |
| `AppModule` | `ThrottlerGuard` como `APP_GUARD` para aplicar a todas las rutas. |
| `@Throttle({ default: { limit: 5, ttl: 60000 } })` | 5 peticiones / 60 s en: `POST /auth/login`, `POST /auth/login-complete`, `POST /auth/register`, `POST /google-authenticator/password-reset/request`. |

**Recomendado (no implementado):**  
Añadir el mismo `@Throttle` en `POST /google-authenticator/verify-login`.

**Archivos:**  
`backend/package.json` (`@nestjs/throttler`), `backend/src/app.module.ts`, `backend/src/auth/auth.controller.ts`, `backend/src/google-authenticator/google-authenticator.controller.ts`.

---

### 4.4 Validación de `logoUrl` contra XSS (Backend + Frontend)

**Problema:**  
`logoUrl` se asigna a `link.href` (favicon) y `img.src` (logo, OG). Si un admin malicioso o un fallo inyectara `javascript:...`, `data:...`, etc., podría producirse XSS.

**Técnica:**  
- **Backend:** Rechazar en persistencia cualquier `logoUrl` que no sea segura.  
- **Frontend:** Sanitizar antes de usarla en `href`/`src`/meta; si no es válida, no usarla (evitar XSS incluso con datos ya almacenados).

**Regla de URL segura:**  
Solo se aceptan:
- `https://...`
- `http://...`
- Rutas que empiecen por `/` y **no** por `//`

Se rechazan, entre otros: `javascript:`, `data:`, `vbscript:`, `file:`.

**Implementación Backend:**

| Método | Acción |
|--------|--------|
| `SystemConfigService.validateLogoUrl(logoUrl)` | Método privado: si no cumple la regla → `BadRequestException('URL de logo no válida')`. |
| `updateLogo(logoUrl)` | Si `logoUrl` no está vacío, llamar a `validateLogoUrl` antes de guardar. |
| `updateLogoConfig` | Cuando se actualiza `logoUrl`, usar `updateLogo`, que ya valida. |

**Implementación Frontend:**

| Ubicación | Acción |
|-----------|--------|
| `sanitizeLogoUrl(url)` | Utilidad: devuelve la URL si es segura según la misma regla; si no, `null`. |
| `useLogo` | `logoUrl: sanitizeLogoUrl(logo?.logoUrl ?? null) ?? null`. FaviconUpdater y Logo consumen `useLogo`. |
| `layout.tsx` (generateMetadata) | `sanitizeLogoUrl(logoConfig.logoUrl)` antes de asignar a meta/OG. |

**Archivos:**  
`backend/src/system-config/system-config.service.ts`; `frontend/src/utils/sanitizeLogoUrl.ts`, `frontend/src/hooks/useLogo.ts`, `frontend/app/layout.tsx`.

---

### 4.5 Autorización de rol desde servidor (no desde `localStorage`)

**Problema:**  
La visibilidad de “Panel de Administración” y el layout de `/admin` dependían de `user.role` en `encryptedStorage`/`localStorage`, manipulable por el cliente.

**Técnica:**  
La decisión “¿es admin?” debe basarse **solo** en respuestas del backend. `localStorage`/`encryptedStorage` pueden seguir usándose para ofuscar datos en disco (nombre, avatar), pero **no** para autorización.

**Implementación:**

| Componente | Cambio |
|------------|--------|
| **MainNav** | Con token, al montar (y en `auth-changed`, `storage`, cierre del modal de auth) llamar a `getMyProfile()` (`GET /users/me`). `isAdmin` se deriva de `profile.role === 'admin'`. El `user` que se pasa a `UserProfileDropdown` viene de esa respuesta. |
| **UserProfileDropdown** | Sigue usando `user.role` para “Panel de Administración”; ahora ese `user` viene de MainNav, que lo obtiene del servidor. |
| **Admin layout** | Comprobar token; luego `getMyProfile()`. Si `String(profile.role).toLowerCase() === 'admin'` → `setIsAuthorized(true)`. Si 401/403 o no admin → `router.replace('/')` y no renderizar el layout. |

**Archivos:**  
`frontend/components/ui/MainNav.tsx`, `frontend/app/admin/layout.tsx`, `frontend/src/services/user/userProfileService.ts` (`getMyProfile` → `GET /users/me`).

---

### 4.6 Reducción de exposición en API pública de productos

**Problema:**  
En listados y respuestas públicas se exponían `additionalFields` (p. ej. “ID de jugador”) y, en una variante evaluada, stock exacto, con riesgo de scraping, automatización y fraude.

**Técnica:**  
- **additionalFields:** No exponer la definición en listados; solo en la ficha de producto (`findBySlugPublic`) cuando se necesite para el flujo de compra.  
- **Stock:** Se documentan dos opciones; la decisión de producto actual es exponer `stock: number | null`. La alternativa `hasStock: boolean` queda como opción para mayor ofuscación.

**Implementación (additionalFields):**

| Método | `additionalFields` en respuesta |
|--------|---------------------------------|
| `findAllPublic` | `additionalFields: null` |
| `findOnePublic` | `additionalFields: null` |
| `findBySlugPublic` | `additionalFields: product.additionalFields ?? null` (ficha de producto) |

**Implementación (stock) — estado actual:**  
- API pública: `stock: number | null` en `PublicPriceDto` y en `toPublicDto` / `toPricesPublicDto`.  
- Frontend: `PublicPrice.stock`, OrderSummary y ProductOptions muestran “Quedan X” o “Ilimitado” cuando aplica.

**Opción alternativa documentada (no activa):**  
Sustituir `stock` por `hasStock: boolean` en DTOs públicos y mapeos para no revelar cantidades exactas. Requiere ajustes en frontend para trabajar solo con disponibilidad booleana.

**Archivos:**  
`backend/src/products/products.service.ts`, `backend/src/products/dto/public-product.dto.ts`, `backend/src/product-prices/product-prices.service.ts`, `backend/src/product-prices/dto/public-price.dto.ts`; `frontend` (publicPriceService, product-detail, OrderSummary, ProductOptions).

---

## 5. Resumen de Archivos Afectados

### Backend
- `src/auth/auth.module.ts`, `auth.service.ts`, `auth.controller.ts`
- `src/users/users.controller.ts`
- `src/app.module.ts`
- `src/google-authenticator/google-authenticator.controller.ts`
- `src/system-config/system-config.service.ts`
- `src/products/products.service.ts`, `dto/public-product.dto.ts`
- `src/product-prices/product-prices.service.ts`, `dto/public-price.dto.ts`

### Frontend
- `src/utils/sanitizeLogoUrl.ts`
- `src/hooks/useLogo.ts`
- `app/layout.tsx`
- `components/ui/MainNav.tsx`
- `app/admin/layout.tsx`
- `src/services/public/publicPriceService.ts`
- `app/(store)/product-detail/[slug]/page.tsx`
- `components/products/OrderSummary.tsx`, `ProductOptions.tsx`

---

## 6. Recomendaciones de Seguimiento

- Añadir `@Throttle` en `POST /google-authenticator/verify-login`.
- Considerar throttling más suave en listados públicos (`GET /public/products`, etc.) para limitar scraping.
- No usar `encryptedStorage`/`localStorage` para decisiones de autorización; solo para ofuscar datos en disco.
- Logging y auditoría (sin datos sensibles) en: login, login-complete, accesos a `/admin`, cambios de logo.
- Revaluar `hasStock` vs `stock` en API pública si se prioriza ofuscación de inventario frente a UX de “Quedan X”.

---

## 7. Referencias

- Plan de remediación: `remediación_vulnerabilidades_pentest_508346c3.plan.md`
- Informe de penetración (origen de los hallazgos)
- `SECURITY_MEASURES_PRD.md` (medidas de seguridad ya existentes: encriptación en frontend, validaciones de saldo, etc.)
