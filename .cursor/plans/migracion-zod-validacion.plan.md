---
name: ""
overview: ""
todos: []
isProject: false
---

# Plan: Migración a Zod para validación obligatoria

## Objetivo

Sustituir class-validator por **Zod** como única fuente de validación de entrada (body, query). El backend debe indicar claramente cuando falte data requerida (400 con detalle). Los campos opcionales se normalizan en el schema con `.transform(v => v ?? null)` para no usar `?? null` en los services.

## Estado actual

- **Validación:** Global `ValidationPipe` en [main.ts](backend/src/main.ts) con class-validator; DTOs con decoradores en `src/**/dto/*.dto.ts`.
- **Zod:** No instalado.
- **Services:** Varios usan `?? null` para opcionales (auth, businesses, qr-codes, api-keys, webhooks).

## Fase 1 — Infraestructura Zod

### 1.1 Instalar Zod

```bash
npm install zod
```

### 1.2 Crear ZodValidationPipe

- **Archivo:** [src/common/pipes/zod-validation.pipe.ts](backend/src/common/pipes/zod-validation.pipe.ts)
- **Comportamiento:** Recibe un `ZodSchema` por constructor. En `transform(value)` ejecuta `schema.safeParse(value)`; si falla, lanzar `BadRequestException` con el error formateado (p. ej. `error.flatten()` o mensaje por campo) para que el cliente sepa qué data falta o es inválida. Si pasa, devolver `result.data`.
- **Uso en controllers:** `@Body(new ZodValidationPipe(createQrCodeSchema))` (o inyectar el schema según convenga).

### 1.3 Schema de paginación común

- **Archivo:** [src/common/schemas/pagination.schema.ts](backend/src/common/schemas/pagination.schema.ts)
- **Contenido:** Schema Zod con `page` y `limit` (opcionales, por defecto 1 y 10, máx. limit 100), con `z.coerce.number()` para query strings. Exportar tipo `PaginationInput` = `z.infer<typeof paginationSchema>`.
- **Nota:** [getPaginationParams](backend/src/common/dto/pagination.dto.ts) y `paginated()` / `PaginatedResponse<T>` se mantienen; reciben un objeto `{ page?, limit? }` que será el resultado del schema. Se puede seguir usando el mismo helper con el objeto validado por Zod.

## Fase 2 — Schemas por módulo

Para cada schema: campos **requeridos** sin `.optional()`; opcionales que en la entidad son nullable con `.optional().nullable().transform(v => v ?? null)` para que el service no use `?? null`. Exportar tipo con `z.infer<typeof schema>`.

### 2.1 Auth


| Archivo                                      | Schema                                                                                                                                                                 | Uso                  |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `src/auth/schemas/login.schema.ts`           | `loginSchema`: email (string email), password (string min 1)                                                                                                           | POST login           |
| `src/auth/schemas/register.schema.ts`        | `registerSchema`: fullName, country opcionales; email, password (min 6); opcionales con `.transform(v => v ?? null)` para fullName/country si se desea null en service | POST register        |
| `src/auth/schemas/change-password.schema.ts` | `changePasswordSchema`: currentPassword, newPassword (string min 6)                                                                                                    | POST change-password |
| `src/auth/schemas/verify-password.schema.ts` | `verifyPasswordSchema`: password (string)                                                                                                                              | POST verify-password |


### 2.2 Users


| Archivo                                         | Schema                                                                             | Uso                                         |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------- |
| `src/users/schemas/update-user.schema.ts`       | `updateUserSchema`: fullName?, email?, country?, walletAddress? (todos opcionales) | PATCH /users/me, PATCH /users/:id (usuario) |
| `src/users/schemas/update-user-admin.schema.ts` | `updateUserAdminSchema`: extiende campos editables + isVerified?, isActive?, role? | PATCH /users/:id (admin)                    |
| `src/users/schemas/delete-user-body.schema.ts`  | `deleteUserBodySchema`: password (string)                                          | DELETE /users/:id, DELETE /users/me         |


### 2.3 Businesses


| Archivo                                            | Schema                                                                                                                                | Uso                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `src/businesses/schemas/create-business.schema.ts` | `createBusinessSchema`: name, walletAddress requeridos; description?, category?, logoUrl? opcionales con `.transform(v => v ?? null)` | POST /businesses      |
| `src/businesses/schemas/update-business.schema.ts` | `updateBusinessSchema`: todos los campos editables opcionales                                                                         | PATCH /businesses/:id |


### 2.4 QR Codes


| Archivo                                         | Schema                                                                                                                                                      | Uso                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `src/qr-codes/schemas/create-qr-code.schema.ts` | `createQrCodeSchema`: label, type, solanaPayUrl requeridos; amountLamports?, tokenMint?, qrImageUrl? con `.optional().nullable().transform(v => v ?? null)` | POST /businesses/:id/qr-codes      |
| `src/qr-codes/schemas/update-qr-code.schema.ts` | `updateQrCodeSchema`: campos editables opcionales; opcionales nullable con transform si aplica                                                              | PATCH /businesses/:id/qr-codes/:id |


### 2.5 API Keys


| Archivo                                         | Schema                                             | Uso     |
| ----------------------------------------------- | -------------------------------------------------- | ------- |
| `src/api-keys/schemas/create-api-key.schema.ts` | `createApiKeySchema`: name?, network? (enum devnet | testnet |


### 2.6 Webhooks


| Archivo                                                  | Schema                                          | Uso                                     |
| -------------------------------------------------------- | ----------------------------------------------- | --------------------------------------- |
| `src/webhooks/schemas/create-webhook-endpoint.schema.ts` | `createWebhookEndpointSchema`: url (string url) | POST /businesses/:id/webhooks/endpoints |
| `src/webhooks/schemas/update-webhook-endpoint.schema.ts` | `updateWebhookEndpointSchema`: url?, isActive?  | PATCH endpoints                         |
| `src/webhooks/schemas/add-subscription.schema.ts`        | `addSubscriptionSchema`: eventType (string)     | POST add subscription                   |
| `src/webhooks/schemas/test-delivery-body.schema.ts`      | body con eventType, payload?                    | POST test delivery (si aplica)          |


## Fase 3 — Controllers

- Sustituir cada `@Body()` que use un DTO de class-validator por `@Body(new ZodValidationPipe(XxxSchema))` e importar el tipo desde el schema (`z.infer`).
- Sustituir cada `@Query()` de paginación por `@Query(new ZodValidationPipe(paginationSchema))` y tipar con `PaginationInput` (o el nombre que se dé al tipo del schema de paginación).
- Mantener `@Param()` sin validación Zod por defecto (UUIDs se pueden validar en el schema del body si se desea, o en un pipe de parámetros aparte; no es obligatorio en esta migración).
- Donde el body sea un objeto pequeño (ej. `{ password: string }` o `{ currentPassword, newPassword }`), usar el schema correspondiente en lugar de tipo anónimo.

## Fase 4 — main.ts y eliminación de ValidationPipe global

- Quitar el `ValidationPipe` global de [main.ts](backend/src/main.ts) (o dejarlo solo si hubiera rutas que sigan usando class-validator; en este plan todo pasa a Zod).
- Asegurar que la transformación de query params (page, limit como número) se haga en el schema Zod con `z.coerce.number()` en [pagination.schema.ts](backend/src/common/schemas/pagination.schema.ts).

## Fase 5 — Services: quitar `?? null`

En los métodos `create()` (y `update()` donde aplique) que reciben el DTO ya validado por Zod con `.transform(v => v ?? null)` en opcionales:

- **auth.service.ts** (register): no asignar `fullName ?? null` ni `country || 'Bolivia'` si el schema ya devuelve null/default; o mantener solo los defaults de negocio (ej. country por defecto) en el schema o en el service según se acuerde.
- **businesses.service.ts** (create): quitar `description: dto.description ?? null`, etc., y confiar en el spread del dto si el schema devuelve null para opcionales.
- **qr-codes.service.ts** (create): quitar `amountLamports: dto.amountLamports ?? null`, `tokenMint: dto.tokenMint ?? null`, `qrImageUrl: dto.qrImageUrl ?? null` y usar solo el spread del dto (el schema ya habrá normalizado a null).
- **api-keys.service.ts** (create): opcionalmente simplificar si el schema fija `network` por defecto.
- **webhooks.service.ts** (createEndpoint): sin cambios relevantes si el body solo tiene `url`.

## Fase 6 — DTOs antiguos y dependencias

- Eliminar o dejar de usar los DTOs de class-validator que fueron reemplazados por tipos inferidos de Zod (los que se usan solo para validación de entrada). Los DTOs de **respuesta** (UserProfileDto, CompleteUserDto, BusinessResponseDto, etc.) se mantienen como tipos/interfaces o clases sin decoradores; no se validan con Zod.
- Opcional: desinstalar `class-validator` si no queda ningún uso (class-transformer puede seguir para serialización de respuestas con `@Exclude()` en entidades).

## Orden sugerido de implementación

1. Instalar Zod y crear `ZodValidationPipe` y `pagination.schema.ts`.
2. Crear schemas de auth (login, register, change-password, verify-password) y actualizar auth.controller.
3. Crear schemas de users (update-user, update-user-admin, delete-user-body) y actualizar users.controller, admin-users.controller, user-profile.controller.
4. Crear schemas de businesses, qr-codes, api-keys, webhooks y actualizar sus controllers.
5. Sustituir en todos los listados el `@Query() pagination: PaginationDto` por el schema de paginación + ZodValidationPipe.
6. Quitar ValidationPipe global en main.ts.
7. Eliminar `?? null` en services (auth, businesses, qr-codes, api-keys, webhooks) según lo indicado en Fase 5.
8. Eliminar DTOs de class-validator de entrada y, si aplica, desinstalar class-validator.
9. Ejecutar `npm run build` y pruebas manuales o e2e.

## Resumen de archivos nuevos

- `src/common/pipes/zod-validation.pipe.ts`
- `src/common/schemas/pagination.schema.ts`
- `src/auth/schemas/login.schema.ts`, `register.schema.ts`, `change-password.schema.ts`, `verify-password.schema.ts`
- `src/users/schemas/update-user.schema.ts`, `update-user-admin.schema.ts`, `delete-user-body.schema.ts`
- `src/businesses/schemas/create-business.schema.ts`, `update-business.schema.ts`
- `src/qr-codes/schemas/create-qr-code.schema.ts`, `update-qr-code.schema.ts`
- `src/api-keys/schemas/create-api-key.schema.ts`
- `src/webhooks/schemas/create-webhook-endpoint.schema.ts`, `update-webhook-endpoint.schema.ts`, `add-subscription.schema.ts`, `test-delivery-body.schema.ts` (si aplica)

## Archivos a modificar

- [main.ts](backend/src/main.ts): quitar ValidationPipe global.
- Todos los controllers que usan `@Body()` o `@Query()` con DTOs: usar `ZodValidationPipe(schema)` y tipos de Zod.
- [auth.service.ts](backend/src/auth/auth.service.ts), [businesses.service.ts](backend/src/businesses/businesses.service.ts), [qr-codes.service.ts](backend/src/qr-codes/qr-codes.service.ts), [api-keys.service.ts](backend/src/api-keys/api-keys.service.ts), [webhooks.service.ts](backend/src/webhooks/webhooks.service.ts): quitar `?? null` donde el schema ya normalice.
- [pagination.dto.ts](backend/src/common/dto/pagination.dto.ts): mantener solo `getPaginationParams`, `PaginatedResponse`, `paginated`; el tipo de entrada de paginación puede ser el inferido del schema de Zod (o un tipo compatible con `{ page?, limit? }`).

## Criterio de éxito

- Toda la validación de body/query de la API usa Zod.
- Si falta data requerida, el cliente recibe 400 con mensaje claro (campo faltante o inválido).
- Los services no usan `?? null` para campos opcionales que el schema Zod ya normaliza a `null`.

