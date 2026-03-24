# Admin: API keys de merchants (escrow)

## Importante sobre el `secret`

El **secret completo** (`sk_*`) **no se puede listar**: en base de datos solo se guarda un **hash bcrypt**. Solo se muestra **una vez** al crear la clave (`POST /businesses/:id/api-keys`).

El **admin** ve:
- `publishableKey` (`pk_*`)
- `secretKeyPreview` (inicio/fin del secreto)
- `secretKeyFullAvailable: false` y `secretKeyNote` explicando lo anterior

Para cortar acceso de un merchant abusivo, usa **deshabilitar** (`disabled: true`). No hace falta conocer el secret.

## Deshabilitar

Con `disabled_at` no nulo, `validateKeys` rechaza la petición: las rutas de escrow con `x-api-key` + `x-secret-key` devuelven **401** (incluso si el secret es correcto).

Las revocaciones por el merchant (`revoked_at`) no se pueden “des-deshabilitar” por admin desde este endpoint; la clave ya no es válida.

---

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/admin/api-keys` | Lista paginada (opcional `search` en email, nombre negocio o publishable key) |
| `PATCH` | `/admin/api-keys/:id` | Body `{ "disabled": true \| false }` |

---

## cURL

```bash
# Listar (JWT admin)
curl -s -H "Authorization: Bearer {{admin_token}}" \
  "{{base}}/admin/api-keys?page=1&limit=20"

curl -s -H "Authorization: Bearer {{admin_token}}" \
  "{{base}}/admin/api-keys?search=merchant@"

# Deshabilitar
curl -s -X PATCH -H "Authorization: Bearer {{admin_token}}" \
  -H "Content-Type: application/json" \
  -d '{"disabled":true}' \
  "{{base}}/admin/api-keys/{{api_key_id}}"

# Reactivar
curl -s -X PATCH -H "Authorization: Bearer {{admin_token}}" \
  -H "Content-Type: application/json" \
  -d '{"disabled":false}' \
  "{{base}}/admin/api-keys/{{api_key_id}}"
```
