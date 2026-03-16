# PRD: Medidas de Seguridad Implementadas

**Versión:** 1.0  
**Fecha:** 2026-01-10  


## 1. Resumen Ejecutivo

Este documento describe las medidas de seguridad implementadas en el sistema para proteger datos sensibles del usuario y prevenir vulnerabilidades de seguridad. Las medidas incluyen encriptación de datos en el frontend, validaciones de seguridad en el backend, y prevención de errores que podrían ser explotados por atacantes.

## 2. Objetivos

### 2.1 Objetivos Principales
- Proteger datos sensibles del usuario almacenados en el navegador
- Prevenir manipulación de datos financieros (saldos, precios)
- Eliminar exposición de información sensible en el navegador
- Prevenir vulnerabilidades de seguridad explotables por atacantes

### 2.2 Objetivos Secundarios
- Mantener compatibilidad con el código existente
- Asegurar que las medidas de seguridad no afecten la experiencia del usuario
- Proporcionar migración automática de datos antiguos

## 3. Alcance

### 3.1 Incluido
- Encriptación de datos de autenticación en localStorage
- Encriptación de datos del carrito en localStorage
- Validaciones de seguridad en pagos con saldo (prevención de saldos negativos)
- Limpieza automática de datos antiguos sin encriptar
- Prevención de condiciones de carrera en transacciones financieras

### 3.2 Excluido
- Encriptación de datos no sensibles (filtros, preferencias)
- Medidas de seguridad a nivel de red (HTTPS, firewalls)
- Autenticación de dos factores (2FA)
- Auditoría de logs de seguridad

## 4. Problemas Identificados y Resueltos

### 4.1 Exposición de Datos Sensibles en localStorage

**Problema:**
- Token JWT visible en localStorage sin encriptar
- Datos del usuario (id, email, roles) visibles sin encriptar
- Datos del carrito (productos, precios) visibles sin encriptar
- Cualquier script malicioso podía acceder a estos datos

**Solución:**
- Implementación de storage encriptado para Zustand
- Encriptación síncrona usando XOR + Base64
- Migración automática de datos antiguos
- Limpieza automática de datos sin encriptar

### 4.2 Vulnerabilidad de Saldo Negativo

**Problema:**
- Un atacante logró hacer que el saldo del usuario se volviera negativo
- El saldo negativo se sumó al balance del usuario (bug crítico)
- No había validaciones suficientes antes de descontar el saldo

**Solución:**
- Validación de total positivo antes de procesar pago
- Validación de precios y cantidades positivas
- Bloqueo de fila (SELECT FOR UPDATE) para prevenir condiciones de carrera
- Validación explícita de saldo no negativo después de calcular
- Validación en transacciones de balance


## 5. Implementación Técnica

### 5.1 Encriptación en Frontend

#### 5.1.1 Utilidad de Encriptación

**¿Por qué se implementa?**
Los datos almacenados en `localStorage` del navegador son accesibles por cualquier script que se ejecute en la página. Sin encriptación, un atacante que inyecte código malicioso (XSS) puede acceder fácilmente a tokens de autenticación y datos sensibles del usuario.

**Implementación:**
- **Algoritmo:** XOR + Base64 (síncrono)
  - **Razón:** Los sistemas de estado como Zustand requieren métodos síncronos para persistencia
  - **Alternativa considerada:** Web Crypto API (asíncrona) - descartada por incompatibilidad
- **Clave:** Derivada de constante + dominio
  - **Razón:** Necesita ser determinística para funcionar en cada carga
  - **Limitación conocida:** Clave visible en código, no es 100% segura pero mejora significativamente la seguridad
- **Métodos:** `encrypt()` y `decrypt()` síncronos
  - **Razón:** Compatibilidad con sistemas de estado que requieren operaciones síncronas

**Flujo de Encriptación:**
```
Datos sensibles (JSON)
    ↓
Serialización JSON
    ↓
Encriptación XOR + Base64
    ↓
Almacenamiento en localStorage
```

**Flujo de Desencriptación:**
```
Datos encriptados de localStorage
    ↓
Desencriptación XOR + Base64
    ↓
Deserialización JSON
    ↓
Datos sensibles (objeto)
```

#### 5.1.2 Storage Encriptado para Sistemas de Estado

**¿Por qué se implementa?**
Los sistemas de estado modernos (Zustand, Redux Persist, etc.) requieren una interfaz de Storage compatible con la API estándar del navegador. Necesitamos interceptar las operaciones de lectura/escritura para encriptar/desencriptar transparentemente.

**Patrón de Implementación:**
- **Wrapper sobre Storage nativo:** Intercepta `getItem()`, `setItem()`, `removeItem()`
- **Cache de valores desencriptados:** 
  - **Razón:** Evitar desencriptar múltiples veces el mismo valor
  - **TTL:** 5 minutos (balance entre seguridad y rendimiento)
- **Detección automática:** Distingue valores encriptados vs. sin encriptar
  - **Razón:** Permite migración gradual de datos antiguos
- **Migración automática:** Convierte valores sin encriptar a encriptados
  - **Razón:** No requiere acción manual del usuario

**Flujo de Escritura:**
```
Sistema de estado actualiza datos
    ↓
Storage wrapper intercepta setItem()
    ↓
Encripta datos antes de guardar
    ↓
Actualiza cache local (para lectura rápida)
    ↓
Guarda en localStorage encriptado
```

**Flujo de Lectura:**
```
Sistema de estado solicita datos
    ↓
Storage wrapper intercepta getItem()
    ↓
Verifica cache → Si existe y válido, devuelve
    ↓
Si no en cache, lee de localStorage
    ↓
Detecta si está encriptado
    ↓
Desencripta si es necesario
    ↓
Actualiza cache
    ↓
Devuelve datos desencriptados
```

#### 5.1.3 Integración con Stores de Estado

**¿Por qué se implementa?**
Los stores de estado gestionan datos sensibles (autenticación, carrito de compras). Necesitamos que estos datos se encripten automáticamente sin modificar la lógica de negocio.

**Patrón de Integración:**
- **Store de Autenticación:**
  - **Datos encriptados:** Token JWT, información del usuario, estado de autenticación
  - **Razón:** Estos datos permiten acceso completo a la cuenta del usuario
  - **Limpieza automática:** Elimina datos antiguos sin encriptar al iniciar sesión/cerrar sesión
    - **Razón:** Prevenir exposición de datos legacy

- **Store de Carrito:**
  - **Datos encriptados:** Items del carrito, precios, cupones aplicados
  - **Razón:** Contiene información de compras del usuario (privacidad)
  - **No encripta:** Estado UI (carrito abierto/cerrado)
    - **Razón:** No es información sensible

- **Otros Stores:**
  - **No requieren encriptación:** Filtros, preferencias UI, configuraciones
  - **Razón:** No contienen información sensible o personal

#### 5.1.4 Inicialización y Migración

**¿Por qué se implementa?**
Al implementar encriptación en un sistema existente, hay datos antiguos sin encriptar que deben migrarse o eliminarse. La inicialización automática asegura que todos los datos se protejan sin intervención manual.

**Flujo de Inicialización:**
```
Aplicación inicia
    ↓
Inicializa storage encriptado
    ↓
Escanea localStorage
    ↓
Identifica datos sensibles (por nombre de clave)
    ↓
Para cada dato:
    ├─ Si está encriptado → Desencripta y cachea
    ├─ Si NO está encriptado → Encripta y reemplaza
    └─ Si es dato antiguo (legacy) → Elimina
    ↓
Sistema listo con datos protegidos
```

### 5.2 Validaciones de Seguridad en Backend

#### 5.2.1 Validaciones en Transacciones Financieras

**¿Por qué se implementa?**
Las transacciones financieras son objetivos comunes de atacantes. Sin validaciones adecuadas, un atacante puede manipular requests para crear saldos negativos, obtener productos gratis, o explotar condiciones de carrera.

**Principios de Seguridad Aplicados:**

1. **Validación de Entrada (Input Validation)**
   - **Razón:** Prevenir inyección de valores maliciosos
   - **Qué validar:**
     - Totales deben ser positivos (> 0)
     - Precios de items deben ser positivos
     - Cantidades deben ser positivas
     - Montos deben ser números válidos y finitos
   - **Cuándo validar:** Antes de cualquier cálculo o actualización de base de datos

2. **Bloqueo de Fila (Row-Level Locking)**
   - **Razón:** Prevenir condiciones de carrera (race conditions)
   - **Problema que resuelve:** 
     - Usuario con $100 intenta comprar $80 dos veces simultáneamente
     - Sin bloqueo: Ambas transacciones leen $100, ambas pasan validación
     - Con bloqueo: Primera transacción bloquea, segunda espera
   - **Implementación:** SELECT FOR UPDATE (pessimistic locking)
   - **Cuándo usar:** En cualquier operación que modifique saldo o recursos limitados

3. **Validación Post-Cálculo**
   - **Razón:** Verificar que los cálculos no resulten en estados inválidos
   - **Qué validar:**
     - Saldo resultante no sea negativo
     - Valores calculados sean números válidos
     - Transacciones no creen estados inconsistentes
   - **Cuándo validar:** Después de calcular pero antes de commit

4. **Validación en Múltiples Puntos**
   - **Razón:** Defense in depth (defensa en profundidad)
   - **Estrategia:** Validar en:
     - Entrada de datos (DTOs)
     - Antes de cálculos
     - Después de cálculos
     - Antes de guardar en BD
   - **Beneficio:** Si una validación falla, otra la detecta

**Flujo de Validación en Pago:**
```
Request recibido
    ↓
Validar estructura de datos (DTO validation)
    ↓
Validar total > 0
    ↓
Validar cada item (precio > 0, cantidad > 0)
    ↓
Iniciar transacción de BD
    ↓
Bloquear fila de usuario (SELECT FOR UPDATE)
    ↓
Leer saldo actual (desde BD bloqueada)
    ↓
Validar saldo suficiente
    ↓
Calcular nuevo saldo
    ↓
Validar nuevo saldo >= 0
    ↓
Crear registro de transacción
    ↓
Validar transacción.newBalance >= 0
    ↓
Commit transacción
    ↓
Liberar bloqueo
```

**Flujo de Validación en Reembolso:**
```
Request recibido
    ↓
Validar estructura de datos
    ↓
Validar monto de reembolso > 0
    ↓
Calcular nuevo balance
    ↓
Validar nuevo balance es número válido
    ↓
Actualizar saldo
    ↓
Crear registro de transacción
```

#### 5.2.2 Prevención de Condiciones de Carrera

**¿Por qué se implementa?**
Las condiciones de carrera ocurren cuando múltiples transacciones acceden y modifican los mismos datos simultáneamente, resultando en estados inconsistentes. En sistemas financieros, esto puede permitir que usuarios obtengan beneficios no autorizados.

**Problema Ejemplo:**
```
Tiempo | Transacción A              | Transacción B              | Saldo Real
-------|----------------------------|----------------------------|------------
T1     | Lee saldo: $100            |                            | $100
T2     |                            | Lee saldo: $100            | $100
T3     | Valida: $100 >= $80 ✓      |                            | $100
T4     |                            | Valida: $100 >= $80 ✓      | $100
T5     | Calcula: $100 - $80 = $20  |                            | $100
T6     |                            | Calcula: $100 - $80 = $20  | $100
T7     | Guarda: $20                |                            | $20
T8     |                            | Guarda: $20                | $20
Resultado: Usuario compró $160 con solo $100
```

**Solución con Bloqueo:**
```
Tiempo | Transacción A              | Transacción B              | Saldo Real
-------|----------------------------|----------------------------|------------
T1     | Bloquea fila               |                            | $100
T2     | Lee saldo: $100            |                            | $100
T3     | Valida: $100 >= $80 ✓      | Intenta leer → ESPERA      | $100
T4     | Calcula: $100 - $80 = $20  | ESPERA                     | $100
T5     | Guarda: $20                | ESPERA                     | $20
T6     | Commit, libera bloqueo      | ESPERA                     | $20
T7     |                            | Bloquea fila               | $20
T8     |                            | Lee saldo: $20             | $20
T9     |                            | Valida: $20 >= $80 ✗      | $20
T10    |                            | Rechaza transacción        | $20
Resultado: Solo una transacción exitosa, saldo correcto
```

**Implementación:**
- **Tipo de bloqueo:** Pessimistic Write Lock
- **Nivel:** Fila (row-level)
- **Duración:** Durante toda la transacción
- **Liberación:** Automática al commit o rollback


## 6. Flujos de Datos

### 6.1 Flujo de Autenticación con Encriptación

```
Usuario inicia sesión
    ↓
setUser() en authStore
    ↓
cleanupUnencryptedData() (limpia datos antiguos)
    ↓
Zustand persist middleware
    ↓
encryptedStorage.setItem()
    ↓
encrypt() (encripta datos)
    ↓
localStorage.setItem() (guarda encriptado)
```

### 6.2 Flujo de Lectura de Datos Encriptados

```
Aplicación inicia
    ↓
initializeEncryptedStorage() (migra datos antiguos)
    ↓
Zustand carga estado
    ↓
encryptedStorage.getItem()
    ↓
Verifica cache → Si existe, devuelve desencriptado
    ↓
Si no en cache, desencripta y cachea
    ↓
Devuelve datos desencriptados
```

### 6.3 Flujo de Pago con Saldo (Validaciones)

```
Usuario intenta pagar con saldo
    ↓
Validar total > 0
    ↓
Validar precios y cantidades > 0
    ↓
Bloquear fila de usuario (SELECT FOR UPDATE)
    ↓
Validar saldo suficiente
    ↓
Calcular nuevo balance
    ↓
Validar nuevo balance >= 0
    ↓
Crear transacción de balance
    ↓
Validar transacción.newBalance >= 0
    ↓
Commit transacción
```

## 7. Casos de Uso

### 7.1 Caso de Uso: Usuario Inicia Sesión

**Precondiciones:**
- Usuario tiene credenciales válidas
- Hay datos antiguos sin encriptar en localStorage (opcional)

**Flujo:**
1. Usuario ingresa credenciales
2. Backend valida y retorna token + datos de usuario
3. `setUser()` se ejecuta en authStore
4. `cleanupUnencryptedData()` elimina datos antiguos
5. Zustand persiste datos usando storage encriptado
6. Datos se encriptan antes de guardar en localStorage

**Resultado:**
- Datos de autenticación guardados encriptados
- Datos antiguos eliminados
- Usuario puede usar la aplicación normalmente

### 7.2 Caso de Uso: Usuario Agrega Producto al Carrito

**Precondiciones:**
- Usuario está autenticado
- Producto existe y está disponible

**Flujo:**
1. Usuario hace clic en "Agregar al carrito"
2. `addItem()` se ejecuta en cartStore
3. Zustand persiste datos usando storage encriptado
4. Datos del carrito se encriptan antes de guardar

**Resultado:**
- Datos del carrito guardados encriptados
- Producto visible en el carrito

### 7.3 Caso de Uso: Usuario Paga con Saldo

**Precondiciones:**
- Usuario tiene saldo suficiente
- Carrito tiene items válidos

**Flujo:**
1. Usuario selecciona "Pagar con saldo"
2. Backend valida total > 0
3. Backend valida precios y cantidades > 0
4. Backend bloquea fila de usuario
5. Backend valida saldo suficiente
6. Backend calcula nuevo balance
7. Backend valida nuevo balance >= 0
8. Backend crea transacción de balance
9. Backend valida transacción.newBalance >= 0
10. Backend commit transacción

**Resultado:**
- Pago procesado correctamente
- Saldo actualizado sin errores
- Orden creada exitosamente


## 8. Métricas y Monitoreo

### 8.1 Métricas de Seguridad

**Frontend:**
- Número de datos antiguos limpiados al iniciar
- Errores de encriptación/desencriptación
- Intentos de acceso a datos encriptados

**Backend:**
- Intentos de pago con saldo insuficiente
- Intentos de crear saldo negativo
- Intentos de manipulación de precios o cantidades
- Errores de validación de seguridad

### 8.2 Logging

**Frontend:**
- Advertencias cuando se limpian datos antiguos
- Errores de encriptación/desencriptación
- Intentos de acceso no autorizado a datos

**Backend:**
- Errores críticos de seguridad (saldos negativos, valores inválidos)
- Intentos de manipulación de datos financieros detectados
- Condiciones de carrera detectadas en transacciones

## 9. Consideraciones de Seguridad

### 9.1 Limitaciones Conocidas

1. **Encriptación en Cliente:**
   - La clave de encriptación está en el código
   - No es 100% segura contra atacantes determinados
   - Mejora significativamente la seguridad vs. datos sin encriptar
   - Dificulta el acceso casual a datos sensibles

2. **Bloqueo de Fila:**
   - El bloqueo de fila puede causar esperas en transacciones concurrentes
   - Se recomienda monitorear tiempos de espera
   - Considerar implementar timeouts para evitar bloqueos prolongados

### 9.2 Mejoras Futuras Recomendadas

1. **Encriptación más Robusta:**
   - Usar Web Crypto API con clave derivada del dominio
   - Implementar rotación de claves
   - Considerar encriptación asíncrona con mejor manejo

2. **Auditoría de Seguridad:**
   - Registrar todos los intentos de manipulación
   - Alertas automáticas para patrones sospechosos
   - Dashboard de seguridad para administradores

3. **Validaciones Adicionales:**
   - Rate limiting en endpoints críticos
   - Validación de integridad de datos
   - Checksums para detectar manipulación

## 10. Testing

### 10.1 Casos de Prueba

**Frontend:**
- [x] Datos se encriptan al guardar
- [x] Datos se desencriptan al leer
- [x] Datos antiguos se limpian automáticamente
- [x] Migración de datos sin encriptar funciona
- [x] Cache funciona correctamente

**Backend:**
- [x] Validación de total positivo funciona
- [x] Validación de precios positivos funciona
- [x] Bloqueo de fila previene condiciones de carrera
- [x] Validación de saldo no negativo funciona
- [x] Validación de montos de reembolso funciona

### 10.2 Pruebas de Penetración

**Recomendadas:**
- Intentar acceder a datos encriptados directamente
- Intentar crear saldo negativo mediante manipulación de requests
- Intentar manipular precios o cantidades en el carrito
- Intentar explotar condiciones de carrera en pagos simultáneos
- Intentar inyectar scripts maliciosos para acceder a localStorage

## 11. Documentación de Usuario

### 11.1 Para Desarrolladores

**Conceptos Clave a Implementar:**

1. **Utilidad de Encriptación:**
   - Implementar funciones `encrypt()` y `decrypt()` síncronas
   - Usar algoritmo compatible con el sistema de estado (síncrono o asíncrono según necesidad)
   - Manejar errores de encriptación/desencriptación gracefully

2. **Storage Wrapper:**
   - Crear wrapper que implemente la interfaz Storage del navegador
   - Interceptar `getItem()`, `setItem()`, `removeItem()`
   - Implementar cache para optimizar rendimiento
   - Detectar y migrar datos antiguos automáticamente

3. **Integración con Sistema de Estado:**
   - Configurar sistema de estado para usar storage encriptado
   - Identificar qué datos requieren encriptación (sensibles vs. no sensibles)
   - Implementar limpieza de datos legacy en puntos clave (login, logout)

4. **Validaciones de Seguridad en Backend:**
   - Validar entrada en múltiples capas (DTO, servicio, BD)
   - Implementar bloqueo de fila para operaciones críticas
   - Validar resultados de cálculos antes de commit
   - Registrar intentos de manipulación para auditoría

### 11.2 Para Administradores

**Monitoreo:**
- Monitorear intentos de manipulación de saldo
- Revisar logs de errores de validación de seguridad
- Monitorear intentos de acceso no autorizado a datos

**Acciones:**
- Si se detectan intentos de manipulación, revisar logs de usuario y bloquear si es necesario
- Si hay errores de encriptación, verificar compatibilidad del navegador
- Si se detectan condiciones de carrera, revisar tiempos de transacción

## 12. Changelog

### Versión 1.0 (2026-01-10)

**Implementado:**
- Encriptación de datos de autenticación en localStorage
- Encriptación de datos del carrito en localStorage
- Validaciones de seguridad en pagos con saldo (prevención de saldos negativos)
- Bloqueo de fila para prevenir condiciones de carrera
- Limpieza automática de datos antiguos sin encriptar
- Migración automática de datos sin encriptar a encriptados
- Validaciones de seguridad en reembolsos

**Componentes Implementados:**

**Frontend:**
- Utilidad de encriptación síncrona
- Storage wrapper encriptado compatible con sistemas de estado
- Integración con stores de autenticación y carrito
- Limpieza automática de datos legacy
- Refactorización de acceso directo a localStorage a través de stores

**Backend:**
- Validaciones de entrada en transacciones financieras
- Implementación de bloqueo de fila (pessimistic locking)
- Validaciones post-cálculo para prevenir estados inválidos
- Validaciones en múltiples capas (defense in depth)
- Logging de intentos de manipulación

## 13. Referencias

- [Zustand Persist Middleware](https://github.com/pmndrs/zustand#persist-middleware)
- [TypeORM Pessimistic Locking](https://typeorm.io/transactions#locking)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)

## 14. Aprobaciones

**Desarrollador:** Implementado  
**Revisión de Seguridad:** Pendiente  
**QA:** Pendiente

---

**Nota:** Este PRD documenta las medidas de seguridad implementadas. Se recomienda una revisión de seguridad profesional para evaluar la efectividad de las medidas y recomendar mejoras adicionales.
