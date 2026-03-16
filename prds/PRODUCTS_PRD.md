# PRD: Sistema de Gestión de Productos

> **Estado (TrustPay):** El backend actual prioriza **users, businesses, qr_codes, api_keys, webhooks**. El módulo de **productos/categorías/órdenes** descrito aquí quedó **fuera del alcance** de la API activa. Este PRD se conserva solo como referencia histórica o futura extensión.

## 1. Resumen Ejecutivo

Este documento describe el sistema de gestión de productos de la plataforma, incluyendo creación, edición, eliminación, gestión de precios, códigos, imágenes y categorización de productos.

**Versión:** 1.5  
**Fecha:** 2026-01-XX  
**Autor:** Sistema de Desarrollo

---

## 2. Objetivos

- Permitir a los administradores gestionar el catálogo de productos
- Facilitar la creación y edición de productos
- Gestionar precios según roles de usuario
- Administrar códigos de productos
- Organizar productos por categorías

---

## 3. Funcionalidades Principales

### 3.1 Creación de Productos

**Proceso:**
1. Administrador accede a "Crear Producto"
2. Completa información básica:
   - Nombre del producto
   - Descripción
   - Categoría
   - Imagen Desktop (obligatoria)
   - Imagen Mobile (opcional)
   - Tipo de producto (Origen/Source): Automático o Manual
   - Estado (activo/inactivo)
3. Guarda el producto
4. Puede agregar precios después de crear

**Información Requerida:**
- Nombre (obligatorio)
- Categoría (obligatorio)
- Imagen Desktop (obligatoria)
- Imagen Mobile (opcional)
- Tipo de producto (obligatorio)

**Tipos de Producto (Source):**
- **Productos Automáticos**: Se entregan códigos automáticamente al completar el pago
- **Productos Manuales**: Requieren intervención del administrador para completar la recarga manualmente

### 3.2 Edición de Productos

**Proceso:**
1. Administrador accede a lista de productos
2. Selecciona producto a editar
3. Modifica información necesaria
4. Guarda cambios
5. Cambios se reflejan inmediatamente

**Campos Editables:**
- Nombre
- Descripción
- Categoría
- Imagen Desktop
- Imagen Mobile
- Estado

### 3.3 Gestión de Precios

**Proceso:**
1. Administrador accede a producto
2. Va a sección "Precios"
3. Agrega nuevo precio con:
   - Nombre del precio (ej: "100 Diamond + 10 Bonus")
   - Costo de compra
   - Margen para cliente final (en porcentaje)
   - Porcentaje de descuento (opcional)
   - Stock disponible (solo para productos Automáticos)
4. Puede editar o eliminar precios existentes
5. Puede activar/desactivar precios

**Tipos de Precios:**
- Precio regular
- Precio con descuento
- Precio promocional

**Stock en Precios:**
- **Productos Automáticos**: Requieren stock definido. El stock se valida y descuenta al procesar órdenes.
- **Productos Manuales**: Tienen stock ilimitado automáticamente. El campo de stock no se muestra en el formulario y se establece como `null` en la base de datos. No se valida ni descuenta stock al procesar órdenes.

### 3.4 Gestión de Códigos

**Proceso:**
1. Administrador accede a producto
2. Va a sección "Códigos"
3. Puede:
   - Agregar códigos individuales
   - Importar códigos en lote
   - Ver códigos disponibles
   - Ver códigos usados
   - Eliminar códigos

**Estados de Códigos:**
- Disponible: Listo para venta
- Usado: Ya fue vendido
- Reservado: Asignado a una orden pendiente

### 3.5 Desactivación de Productos

**Proceso:**
1. Administrador accede a producto
2. Hace clic en "Desactivar"
3. Sistema confirma desactivación
4. El producto se marca como inactivo (`isActive = false`)
5. Todos los precios del producto se desactivan automáticamente (`state = 'inactive'`)
6. El producto y sus precios dejan de mostrarse en el frontend público
7. El producto sigue visible en el panel de administración con indicador visual de "Desactivado"

**Comportamiento:**
- Los productos desactivados no se eliminan físicamente de la base de datos
- Esto mantiene la integridad referencial con órdenes existentes
- Los productos desactivados pueden ser reactivados manualmente en el futuro (funcionalidad pendiente)
- Al desactivar un producto, todos sus precios asociados también se desactivan automáticamente

### 3.6 Tipos de Productos (Source)

El sistema soporta dos tipos de productos según su origen o método de entrega:

**Productos Automáticos:**
- Productos que entregan códigos/keys automáticamente al completar el pago
- Los códigos se asignan automáticamente cuando el pago se confirma
- Los códigos aparecen inmediatamente en "Mis Pedidos" del cliente
- Los códigos también aparecen en el apartado de keys del cliente
- La orden se completa automáticamente al confirmar el pago

**Productos Manuales:**
- Productos que requieren recarga manual por parte del administrador
- No se entregan códigos/keys automáticamente
- No aparecen códigos en el apartado de keys del cliente
- Solo aparece la orden en "Mis Pedidos" del cliente
- La orden queda en estado "Procesando" después del pago
- El administrador debe realizar la recarga manualmente
- El administrador debe marcar la orden como "Completado" después de realizar la recarga manual
- **Stock Ilimitado**: Los precios de productos Manual tienen stock ilimitado automáticamente
  - El campo de stock no se muestra en el formulario de creación/edición de precios
  - El stock se establece como `null` en la base de datos
  - No se valida ni descuenta stock al procesar órdenes
  - En el frontend, se muestra "∞" (infinito) o "Ilimitado" en lugar de un número
- **Campos Adicionales**: Los productos Manual pueden tener campos personalizados que el cliente debe completar al realizar la compra
  - El administrador define los campos adicionales al crear/editar el producto (ej: ID de juego, zona, servidor, etc.)
  - Los campos pueden ser de tipo: texto, número, email, teléfono o textarea
  - Los campos pueden ser obligatorios u opcionales
  - Los valores ingresados por el cliente se guardan en la orden
  - Los campos adicionales se muestran en el modal de detalles de orden para que el administrador pueda ver la información necesaria para procesar la recarga manual

---

## 4. Flujos de Usuario

### 4.1 Flujo de Creación de Producto

```
1. Admin accede a "Crear Producto"
2. Completa formulario básico
3. Sube imagen (opcional)
4. Selecciona categoría
5. Guarda producto
6. Sistema muestra confirmación
7. Admin puede agregar precios
8. Admin puede agregar códigos
```

### 4.2 Flujo de Agregar Precio

```
1. Admin accede a producto existente
2. Va a pestaña "Precios"
3. Hace clic en "Agregar Precio"
4. Completa información del precio
5. Define márgenes por rol
6. Establece stock
7. Guarda precio
8. Precio aparece en lista
```

### 4.3 Flujo de Gestión de Códigos

```
1. Admin accede a producto
2. Va a pestaña "Códigos"
3. Opción A: Agrega códigos manualmente
   - Ingresa código uno por uno
   - Guarda cada código
4. Opción B: Importa códigos en lote
   - Sube archivo con códigos
   - Sistema valida y agrega
5. Ve lista de códigos disponibles
6. Puede eliminar códigos no usados
```

---

## 5. Casos de Uso

### 5.1 Admin Crea Nuevo Producto

**Escenario:** Administrador quiere agregar un nuevo producto al catálogo.

**Proceso:**
1. Crea producto con información básica
2. Agrega imagen Desktop atractiva (y opcionalmente imagen Mobile)
3. Crea varios precios para diferentes cantidades
4. Importa códigos del producto
5. Activa el producto
6. Producto aparece en la tienda

### 5.2 Admin Actualiza Precios

**Escenario:** Administrador necesita cambiar precios de un producto.

**Proceso:**
1. Accede al producto
2. Ve lista de precios actuales
3. Edita precios necesarios
4. Guarda cambios
5. Los nuevos precios se aplican inmediatamente

### 5.3 Admin Gestiona Stock

**Escenario:** Administrador necesita agregar más códigos a un producto.

**Proceso:**
1. Accede a sección de códigos
2. Ve códigos disponibles restantes
3. Si quedan pocos, importa nuevos códigos
4. Sistema actualiza stock automáticamente

---

## 6. Estructura de Producto

### 6.1 Información Básica

- Nombre
- Descripción
- Categoría
- Imagen Desktop (obligatoria)
- Imagen Mobile (opcional)
- Slug (URL amigable)
- Source (Origen/Tipo): Automático o Manual
- Estado activo/inactivo (`isActive: boolean`, por defecto `true`)
- Campos Adicionales (solo para productos Manual):
  - Definición de campos personalizados que el cliente debe completar
  - Cada campo tiene: etiqueta, tipo (texto/número/email/teléfono/textarea), y si es obligatorio
  - Los valores ingresados por el cliente se almacenan en la orden

### 6.2 Precios

Cada producto puede tener múltiples precios:
- Nombre del precio
- Costo de compra
- Margen final del cliente (en porcentaje)
- Porcentaje de descuento (opcional)
- Stock disponible (solo para productos Automáticos, `null` para productos Manuales)
- Estado (activo/inactivo): `state: 'active' | 'inactive'`

**Desactivación Automática de Precios:**
- Cuando un producto se desactiva, todos sus precios se desactivan automáticamente
- Los precios desactivados no se muestran en el frontend público
- Los precios desactivados siguen siendo visibles en el panel de administración

**Comportamiento del Stock:**
- **Productos Automáticos**: El stock es un número entero que se valida y descuenta al procesar órdenes
- **Productos Manuales**: El stock es `null` (ilimitado), no se valida ni descuenta al procesar órdenes

### 6.3 Códigos

- Código único
- Estado (disponible/usado/reservado)
- Fecha de uso (si fue usado)
- Orden asociada (si fue vendido)

### 6.4 Campos Adicionales (Productos Manuales)

Los productos Manual pueden tener campos adicionales personalizados:

**Definición de Campos:**
- Etiqueta del campo (nombre que verá el cliente)
- Tipo de campo: texto, número, email, teléfono o textarea
- Campo obligatorio u opcional

**Uso en Órdenes:**
- Cuando un cliente compra un producto Manual con campos adicionales, debe completar estos campos antes de agregar al carrito
- Los valores ingresados se guardan temporalmente en localStorage
- Al crear la orden, los valores se envían al backend y se almacenan en el campo `additionalFields` del `OrderItem`
- En el modal de detalles de orden, se muestra una sección "Información Adicional" con todos los campos y sus valores
- Esta información permite al administrador procesar la recarga manual con los datos necesarios

---

## 7. Consideraciones Técnicas

### 7.1 Imágenes

- Se almacenan en servicio de almacenamiento en la nube
- Formatos soportados: JPG, PNG, WebP
- Tamaño recomendado optimizado para web

### 7.2 Stock

**Productos Automáticos:**
- Se actualiza automáticamente al vender
- Se reserva temporalmente al agregar al carrito
- Se libera si la orden se cancela
- Se valida antes de procesar la orden (debe haber stock suficiente)

**Productos Manuales:**
- Tienen stock ilimitado (`null` en la base de datos)
- No se valida stock al procesar órdenes
- No se descuenta stock al procesar órdenes
- El campo de stock no se muestra en el formulario de precios
- En el frontend se muestra como "∞" (infinito) o "Ilimitado"

### 7.3 Precios por Rol

- Cliente Final: Precio con margen de cliente final
- Reseller: Precio con margen de revendedor
- Mayorista: Precio con margen mayorista
- Los precios se calculan automáticamente según el rol

---

## 8. Referencias

**Archivos Relacionados:**
- `src/products/`: Módulo de productos
- `src/product-prices/`: Módulo de precios
- `src/codes/`: Módulo de códigos
- `src/categories/`: Módulo de categorías

---

**Última Actualización:** 2026-01-XX

**Cambios en Versión 1.2:**
- Agregado soporte para stock ilimitado en productos Manual
- Los precios de productos Manual tienen stock `null` automáticamente
- No se valida ni descuenta stock para productos Manual al procesar órdenes

**Cambios en Versión 1.3:**
- Agregado soporte para imagen Desktop e imagen Mobile
- Campo "Imagen Desktop" es obligatorio
- Campo "Imagen Mobile" es opcional
- Actualizado formulario de creación y edición de productos para incluir ambos campos
- Actualizado backend para almacenar ambas imágenes en la base de datos
- Actualizado margen final del cliente para usar porcentaje en lugar de valor fijo

**Cambios en Versión 1.4:**
- Agregado soporte para campos adicionales en productos Manual
- Los administradores pueden definir campos personalizados que el cliente debe completar (ej: ID de juego, zona, servidor)
- Los campos adicionales se muestran al cliente al agregar el producto al carrito
- Los valores ingresados por el cliente se almacenan en la orden (campo `additionalFields` en `OrderItem`)
- Los campos adicionales se muestran en el modal de detalles de orden para facilitar el procesamiento manual
- Actualizado backend: agregado campo `additionalFields` a la entidad `OrderItem`
- Actualizado frontend: lectura de campos desde localStorage y envío al backend al crear órdenes

**Cambios en Versión 1.5:**
- Cambiado el comportamiento de eliminación de productos a desactivación
- Agregado campo `isActive: boolean` a la entidad `Product` (por defecto `true`)
- Los productos desactivados no se eliminan físicamente, manteniendo la integridad referencial con órdenes
- Al desactivar un producto, todos sus precios se desactivan automáticamente (`state = 'inactive'`)
- Los productos desactivados no se muestran en el frontend público, pero sí en el panel de administración
- Agregado indicador visual "Desactivado" en el panel de administración para productos inactivos
- Actualizado backend: método `remove()` ahora desactiva el producto y sus precios en lugar de eliminarlos
- Actualizado frontend: mensajes y títulos cambiados de "Eliminar" a "Desactivar"
- Agregado parámetro `includeInactive` a los endpoints de productos para permitir ver productos inactivos en el admin
