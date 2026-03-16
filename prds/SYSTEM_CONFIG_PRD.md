# PRD: Sistema de Configuración General

## 1. Resumen Ejecutivo

Este documento describe el sistema de configuración general de la plataforma que permite a los administradores personalizar aspectos visuales, funcionales y de contenido del sitio web.

**Versión:** 1.1  
**Fecha:** 2026-01-XX  
**Autor:** Sistema de Desarrollo

---

## 2. Objetivos

- Permitir personalización visual del sitio
- Gestionar contenido del footer
- Configurar colores y estilos
- Personalizar textos y mensajes
- Configurar logo y texto del logo
- Configurar redes sociales
- Gestionar configuración de WhatsApp

---

## 3. Funcionalidades Principales

### 3.1 Configuración de Colores

**Proceso:**
1. Administrador accede a "Configuraciones → Colores"
2. Configura colores de:
   - Header
   - Footer
   - Fondo
   - Texto
3. Ve vista previa en tiempo real
4. Guarda cambios
5. Colores se aplican inmediatamente

**Colores Configurables:**
- Color del header
- Color del footer
- Color de fondo
- Color de texto principal

### 3.2 Configuración de Textos

**Proceso:**
1. Administrador accede a "Configuraciones → Textos"
2. Configura:
   - Fuente del sitio
   - Color del texto
   - Color de títulos
   - Color de enlaces
   - Color de enlaces al pasar mouse
3. Ve vista previa de diferentes páginas
4. Guarda cambios
5. Estilos se aplican a todo el sitio

**Opciones Disponibles:**
- Selección de fuente (Google Fonts)
- Colores personalizados
- Vista previa en tiempo real

### 3.3 Configuración de Footer

**Proceso:**
1. Administrador accede a "Configuraciones → Footer"
2. Crea grupos de enlaces
3. Agrega páginas a cada grupo
4. Configura orden de visualización
5. Edita contenido de páginas
6. Footer se actualiza automáticamente

**Estructura:**
- Grupos de enlaces (ej: "Soporte", "Legal")
- Páginas dentro de cada grupo
- Texto "Acerca de" del footer

### 3.4 Configuración de Redes Sociales

**Proceso:**
1. Administrador accede a "Configuraciones → Redes Sociales"
2. Agrega redes sociales:
   - Nombre
   - URL
   - Icono
3. Configura orden de visualización
4. Activa/desactiva redes
5. Aparecen en footer del sitio

### 3.5 Configuración de Login y Register

**Proceso:**
1. Administrador accede a "Configuraciones → Login y Register"
2. Configura colores de:
   - Fondo del modal
   - Botones
   - Campos de entrada
   - Texto
3. Ve vista previa
4. Guarda cambios
5. Colores se aplican a modales de autenticación

### 3.6 Configuración de Logo

**Proceso:**
1. Administrador accede a "Configuraciones → Colores"
2. En la sección "Logo de la Tienda":
   - Sube imagen del logo (arrastra y suelta o selecciona archivo)
   - Configura tamaño del logo en el header (20-100px)
   - Configura tamaño del logo en el footer (20-100px)
   - Ingresa texto que aparecerá junto al logo en el header
3. Ve vista previa del logo con el texto
4. Guarda cambios
5. Logo y texto se aplican inmediatamente en el header

**Opciones Disponibles:**
- Subida de imagen del logo (JPG, PNG, SVG, WEBP)
- Tamaño personalizado para header y footer
- Texto editable que aparece junto al logo (solo en header)
- Vista previa en tiempo real
- Valor por defecto del texto: "TimGamers"

**Comportamiento:**
- El logo se muestra en el header y footer
- El texto solo aparece en el header, junto al logo
- El texto tiene efecto hover que cambia el color
- El texto es responsive (tamaño adaptativo según pantalla)

### 3.7 Configuración de WhatsApp

**Proceso:**
1. Administrador accede a "Configuraciones → Configurar Whatsapp"
2. Selecciona país
3. Ingresa número de teléfono
4. Configura mensaje predeterminado (opcional)
5. Guarda configuración
6. Botones de WhatsApp funcionan con esta configuración

---

## 4. Flujos de Usuario

### 4.1 Flujo de Configuración de Colores

```
1. Admin accede a configuración de colores
2. Selecciona color para cada sección
3. Ve vista previa actualizada
4. Ajusta colores hasta estar satisfecho
5. Guarda cambios
6. Colores se aplican al sitio
```

### 4.2 Flujo de Personalización de Footer

```
1. Admin accede a configuración de footer
2. Crea grupo de enlaces
3. Agrega páginas al grupo
4. Edita contenido de páginas
5. Configura orden
6. Footer se actualiza automáticamente
```

### 4.3 Flujo de Configuración de Textos

```
1. Admin accede a configuración de textos
2. Selecciona fuente
3. Configura colores de texto
4. Ve vista previa de diferentes páginas
5. Ajusta hasta estar satisfecho
6. Guarda cambios
```

### 4.4 Flujo de Configuración de Logo

```
1. Admin accede a configuración de colores
2. Va a sección "Logo de la Tienda"
3. Sube imagen del logo (arrastra y suelta)
4. Configura tamaño para header y footer
5. Ingresa texto que aparecerá junto al logo
6. Ve vista previa del logo con texto
7. Guarda cambios
8. Logo y texto aparecen en el header
```

---

## 5. Casos de Uso

### 5.1 Admin Personaliza Colores del Sitio

**Escenario:** Administrador quiere cambiar colores del sitio.

**Proceso:**
1. Accede a configuración de colores
2. Cambia color del header a azul
3. Cambia color del footer a gris oscuro
4. Ve vista previa
5. Guarda cambios
6. Sitio se actualiza con nuevos colores

### 5.2 Admin Configura Footer

**Escenario:** Administrador quiere organizar footer.

**Proceso:**
1. Crea grupo "Soporte"
2. Agrega páginas: "Contacto", "FAQ", "Ayuda"
3. Crea grupo "Legal"
4. Agrega páginas: "Términos", "Privacidad"
5. Configura orden
6. Footer queda organizado

### 5.3 Admin Personaliza Estilos de Texto

**Escenario:** Administrador quiere cambiar fuente del sitio.

**Proceso:**
1. Accede a configuración de textos
2. Selecciona nueva fuente (ej: "Roboto")
3. Ajusta colores de texto
4. Ve vista previa
5. Guarda cambios
6. Todo el sitio usa nueva fuente

### 5.4 Admin Configura Logo y Texto

**Escenario:** Administrador quiere personalizar el logo y agregar texto junto a él.

**Proceso:**
1. Accede a configuración de colores
2. Sube nueva imagen de logo
3. Configura tamaño del logo en header (ej: 40px)
4. Configura tamaño del logo en footer (ej: 40px)
5. Ingresa texto "TimGamers" para que aparezca junto al logo
6. Ve vista previa del logo con texto
7. Guarda cambios
8. Logo y texto aparecen en el header del sitio

---

## 6. Estructura de Configuración

### 6.1 Colores

- Header color
- Footer color
- Background color
- Text color

### 6.2 Textos

- Font family
- Text color
- Heading color
- Link color
- Link hover color

### 6.3 Footer

- Grupos de enlaces
- Páginas por grupo
- Texto "Acerca de"
- Orden de visualización

### 6.4 Logo

- URL de la imagen del logo
- Tamaño del logo en header (en píxeles, rango 20-100)
- Tamaño del logo en footer (en píxeles, rango 20-100)
- Texto del logo (texto que aparece junto al logo en el header)
- Valor por defecto del texto: "TimGamers"

### 6.5 Redes Sociales

- Lista de redes
- URL de cada red
- Icono de cada red
- Estado (activa/inactiva)

---

## 7. Consideraciones Técnicas

### 7.1 Aplicación de Cambios

- Cambios se aplican inmediatamente
- No requieren recarga del servidor
- Se guardan en base de datos

### 7.2 Vista Previa

- Se muestra en tiempo real
- Permite ver cambios antes de guardar
- Muestra diferentes páginas

### 7.3 Persistencia

- Configuraciones se guardan permanentemente
- Se cargan al iniciar el sitio
- Se pueden revertir cambios

---

## 8. Referencias

**Archivos Relacionados:**
- `src/system-config/`: Módulo de configuración

---

**Última Actualización:** 2026-01-XX

**Cambios en Versión 1.1:**
- Agregada configuración completa del logo
- Los administradores pueden subir una imagen para el logo
- Configuración de tamaño del logo para header y footer (rango 20-100px)
- Agregado campo de texto editable que aparece junto al logo en el header
- El texto del logo es personalizable y se muestra solo en el header
- Valor por defecto del texto: "TimGamers"
- Vista previa del logo con texto en tiempo real
- El texto tiene efecto hover que cambia el color
- El texto es responsive (tamaño adaptativo según pantalla)
- Actualizado backend: agregado campo `logoText` a la configuración del logo
- Actualizado frontend: componente Logo muestra texto junto al logo cuando está en el header
