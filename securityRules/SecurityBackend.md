# PRD: Reglas de Seguridad para Desarrollo Backend

**Versión:** 2.0  
**Fecha:** 2026-01-17  
**Estado:** Activo  
**Propósito:** Guía de referencia para desarrolladores backend sobre prácticas de seguridad

## 1. Resumen Ejecutivo

Este documento establece las reglas y mejores prácticas de seguridad que deben seguirse al desarrollar el backend de la aplicación. Estas reglas están basadas en vulnerabilidades reales identificadas y mitigaciones implementadas.

**Principios Fundamentales:**
- **Nunca confiar en el cliente**: Todas las validaciones deben estar en el backend
- **Defensa en profundidad**: Múltiples capas de validación
- **Principio de menor privilegio**: Usuarios solo acceden a lo necesario
- **Separación de responsabilidades**: Endpoints públicos y privados separados
- **Auditoría completa**: Registrar todas las acciones críticas

## 2. Reglas de Seguridad por Categoría

### 2.1 Autorización y Control de Acceso

#### ✅ REGLA 1: Proteger Todos los Endpoints con Guards Apropiados

**¿Por qué?**
- Previene acceso no autorizado a recursos
- Asegura que solo usuarios autorizados puedan realizar acciones
- Protege contra IDOR (Insecure Direct Object Reference)

**Implementación:**
```typescript
// ✅ CORRECTO: Usar RolesGuard para endpoints administrativos
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';

@Controller('users')
export class UsersController {
  @Get('members/all')
  @UseGuards(JwtAuthGuard, RolesGuard) // ✅ Orden: JwtAuthGuard primero
  @Roles(Role.ADMIN, Role.SUPERADMIN) // ✅ Roles específicos
  @ApiBearerAuth()
  findAllMembers() {
    return this.usersService.findAllMembers();
  }
}

// ❌ INCORRECTO: Endpoint sin protección
@Get('members/all')
findAllMembers() { // ❌ Cualquiera puede acceder
  return this.usersService.findAllMembers();
}
```

**Reglas de Roles:**
- `ADMIN` y `SUPERADMIN`: Acceso a endpoints administrativos
- `SUPERADMIN`: Operaciones críticas (ej: operación `set` en balance)
- `SUPPORT`: Acceso a dashboard de soporte y órdenes
- Usuarios normales: Solo sus propios recursos

#### ✅ REGLA 2: Validar Propiedad de Recursos

**¿Por qué?**
- Previene que usuarios accedan a recursos de otros usuarios
- Protege contra IDOR
- Asegura privacidad de datos

**Implementación:**
```typescript
// ✅ CORRECTO: Validar propiedad antes de permitir acceso
@Get('balance-transactions/user/:userId')
@UseGuards(JwtAuthGuard)
async getUserTransactions(
  @Param('userId') userId: string,
  @Request() req
) {
  const currentUserId = req.user.id;
  const currentUserRole = req.user.roles;
  
  // Validar propiedad o rol de administrador
  if (userId !== currentUserId && 
      currentUserRole !== 'admin' && 
      currentUserRole !== 'superadmin') {
    throw new ForbiddenException('Solo puedes ver tus propias transacciones');
  }
  
  return this.balanceTransactionsService.findByUser(userId);
}

// ❌ INCORRECTO: No validar propiedad
@Get('balance-transactions/user/:userId')
async getUserTransactions(@Param('userId') userId: string) {
  // ❌ Cualquier usuario puede ver transacciones de otros
  return this.balanceTransactionsService.findByUser(userId);
}
```

#### ✅ REGLA 3: Validar Operaciones Críticas por Rol

**¿Por qué?**
- Algunas operaciones solo deben ser ejecutadas por roles específicos
- Previene escalación de privilegios
- Protege operaciones financieras críticas

**Implementación:**
```typescript
// ✅ CORRECTO: Validar rol antes de operación crítica
@Patch('balance')
@UseGuards(JwtAuthGuard)
async updateUserBalance(
  @Request() req,
  @Body() updateBalanceDto: UpdateBalanceDto
) {
  const operatorRole = req.user.roles;
  const { operation, amount } = updateBalanceDto;
  
  // Operación 'set' solo para superadmin
  if (operation === 'set' && operatorRole !== 'superadmin') {
    this.securityLogger.logSecurityEvent(
      'BALANCE_SET_ATTEMPT_UNAUTHORIZED',
      { operatorRole, operation, amount },
      'high'
    );
    throw new BadRequestException(
      'La operación "set" solo puede ser ejecutada por superadministradores'
    );
  }
  
  return this.usersService.updateUserBalance(/* ... */);
}

// ❌ INCORRECTO: Permitir operación crítica sin validación
@Patch('balance')
async updateUserBalance(@Body() dto: UpdateBalanceDto) {
  // ❌ Cualquier usuario puede usar 'set'
  return this.usersService.updateUserBalance(dto);
}
```

### 2.2 Validación de Datos

#### ✅ REGLA 4: Validar TODOS los Datos del Cliente

**¿Por qué?**
- El cliente puede modificar cualquier dato antes de enviarlo
- Previene manipulación de precios, cantidades, montos
- Protege contra inyección de datos maliciosos

**Flujo de Validación en Múltiples Capas:**

**Capa 1: DTOs (class-validator)**
- Validación de estructura y tipos al recibir la petición
- Rechaza inmediatamente si los datos no cumplen formato básico
- Validaciones: `@IsInt()`, `@Min()`, `@Max()`, `@IsUUID()`, `@IsNumber()`

**Capa 2: Guards (AmountLimitGuard)**
- Validación de límites de montos y cantidades antes de procesar
- Aplica límites específicos por endpoint usando decorador `@AmountLimits()`
- Previene montos negativos, extremos o fuera de rango permitido

**Capa 3: Services de Validación (OrderValidationService, RechargeValidationService)**
- Recalcula precios desde la base de datos (NO confía en el cliente)
- Valida stock disponible con locks para prevenir race conditions
- Calcula totales en el servidor, no acepta totales del cliente
- Verifica pagos reales con proveedores externos antes de acreditar

**Capa 4: Base de Datos (Transacciones con Locks)**
- Operaciones atómicas con bloqueo pesimista (SELECT FOR UPDATE)
- Previene condiciones de carrera
- Rollback automático si alguna validación falla

**Implementación:**
```typescript
// ✅ CORRECTO: Validar datos contra valores calculados
async createOrder(user: User, createOrderDto: CreateOrderDto) {
  // 1. Validar estructura (DTO validation)
  // 2. Validar stock
  await this.validateStockBeforeOrder(createOrderDto.items);
  
  // 3. Validar precios (CRÍTICO)
  for (const item of createOrderDto.items) {
    const productPrice = await this.productPricesRepository.findOne({
      where: { id: item.metadata.priceId }
    });
    
    // Calcular precio esperado
    const expectedPrice = await this.productPricesService.calculateFinalPrice(
      productPrice,
      this.getCustomerType(user)
    );
    
    // Comparar con precio recibido
    if (Math.abs(item.price - expectedPrice) > 0.01) {
      this.logger.error(`🚨 Manipulación de precio detectada`);
      throw new BadRequestException('Precio inválido');
    }
  }
  
  // Continuar con creación de orden...
}

// ❌ INCORRECTO: Confiar en precio del cliente
async createOrder(user: User, createOrderDto: CreateOrderDto) {
  // ❌ Usa precio del cliente sin validar
  const total = createOrderDto.items.reduce((sum, item) => 
    sum + item.price * item.quantity, 0
  );
  // ❌ Atacante puede enviar precio = 0.01
}
```

#### ✅ REGLA 5: Validar Montos en Pagos

**¿Por qué?**
- Previene fraude financiero directo
- Asegura que el monto pagado coincida con el total de la orden
- Protege contra manipulación de precios en flujo de pago

**Implementación:**
```typescript
// ✅ CORRECTO: Validar monto contra total de orden
async createOrderPaymentSession(
  orderId: string,
  totalAmountOverride?: number,
  userId?: string
) {
  const order = await this.ordersRepository.findOne({
    where: { id: orderId },
    relations: ['user']
  });
  
  // Validar propiedad de orden
  if (order.user.id !== userId) {
    throw new ForbiddenException('No puedes crear sesión para esta orden');
  }
  
  // Validar monto si se proporciona
  if (totalAmountOverride !== undefined) {
    const difference = Math.abs(totalAmountOverride - order.total);
    if (difference > 0.01) { // Tolerancia para redondeos
      this.securityLogger.logSecurityEvent(
        'PAYMENT_PRICE_MANIPULATION_ATTEMPT',
        {
          userId,
          orderId,
          orderTotal: order.total,
          providedAmount: totalAmountOverride,
          difference
        },
        'critical'
      );
      throw new BadRequestException(
        'El monto proporcionado no coincide con el total de la orden'
      );
    }
  }
  
  // Usar total de la orden, no el proporcionado
  return this.createPaymentSession(order, order.total);
}

// ❌ INCORRECTO: Usar monto del cliente sin validar
async createOrderPaymentSession(orderId: string, totalAmount: number) {
  // ❌ Usa monto del cliente directamente
  return this.createPaymentSession(order, totalAmount); // ❌ Puede ser manipulado
}
```

#### ✅ REGLA 6: Validar Entrada con DTOs y Class Validator

**¿Por qué?**
- Asegura estructura correcta de datos
- Previene inyección de datos maliciosos
- Valida tipos y rangos

**Implementación:**
```typescript
// ✅ CORRECTO: Usar DTOs con validaciones
import { IsNumber, IsPositive, Min, Max } from 'class-validator';

export class CreateOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
  
  @IsNumber()
  @IsPositive()
  @Min(0.01)
  @Max(999999.99)
  total: number;
}

export class OrderItemDto {
  @IsString()
  @IsUUID()
  productId: string;
  
  @IsNumber()
  @IsPositive()
  @Min(1)
  @Max(1000)
  quantity: number;
  
  @IsNumber()
  @IsPositive()
  @Min(0.01)
  price: number;
}

// En el controlador
@Post()
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
createOrder(@Body() createOrderDto: CreateOrderDto) {
  // ✅ DTO ya validado
  return this.ordersService.createOrder(user, createOrderDto);
}

// ❌ INCORRECTO: Aceptar any sin validación
@Post()
createOrder(@Body() data: any) { // ❌ Sin validación
  return this.ordersService.createOrder(user, data);
}
```

### 2.3 Validación de Órdenes y Recargas

#### ✅ REGLA 7: Recalcular Precios desde Base de Datos en Órdenes

**¿Por qué?**
- El cliente puede manipular precios antes de enviarlos
- Los precios pueden cambiar entre la selección y la compra
- Previene fraude directo por manipulación de precios

**Flujo de Validación de Órdenes:**
1. **DTO Validation**: Valida estructura básica (cantidades enteras, precios positivos)
2. **AmountLimitGuard**: Valida límites de cantidades (1-999) y precios
3. **OrderValidationService.validateAndEnrichOrderItems()**:
   - Obtiene precio REAL desde la base de datos usando `priceId`
   - Calcula precio según tipo de cliente
   - Reemplaza precio del cliente con precio real de BD
   - Valida que el producto existe y está activo
4. **OrderValidationService.calculateOrderTotal()**:
   - Calcula subtotal desde items validados
   - Aplica descuentos de cupones (si aplica)
   - Calcula total final en el servidor
5. **OrderValidationService.reserveStock()**:
   - Valida stock disponible
   - Reserva stock atómicamente con locks
   - Previene overselling (vender más de lo disponible)
6. **Crear Orden**: Usa items con precios REALES y total RECALCULADO

**Campos que se Recalculan (NO se confía en el cliente):**
- Precio unitario de cada item
- Subtotal de cada item
- Subtotal de la orden
- Descuento de cupones
- Total final de la orden

#### ✅ REGLA 8: Validar y Verificar Pagos Reales en Recargas

**¿Por qué?**
- Previene acreditación de saldo sin pago real
- Previene doble acreditación del mismo pago
- Asegura que el monto acreditado coincida con el pago real

**Flujo de Validación de Recargas:**
1. **DTO Validation**: Valida monto entre $0.01 y $500.00, máximo 2 decimales
2. **AmountLimitGuard**: Valida límites de monto antes de crear sesión
3. **RechargeValidationService.validateRechargeAmount()**:
   - Valida que el monto sea número válido
   - Valida que sea positivo
   - Valida rango permitido ($0.01 - $500.00)
   - Valida máximo 2 decimales
4. **Crear Transacción PENDING**: Se crea con estado pendiente
5. **Usuario paga con proveedor externo**: Binance Pay, PayPal, Veripagos
6. **RechargeValidationService.preventDoubleCredit()**:
   - Verifica que la transacción no haya sido procesada antes
   - Previene doble acreditación del mismo pago
7. **RechargeValidationService.verifyPaymentWithProvider()**:
   - Verifica pago REAL con API del proveedor
   - Obtiene monto realmente pagado desde el proveedor
   - Valida que el monto coincida con el esperado
8. **RechargeValidationService.creditUserBalance()**:
   - Bloquea fila de usuario (SELECT FOR UPDATE)
   - Valida saldo actual
   - Acredita saldo atómicamente
   - Actualiza transacción a COMPLETED
   - Registra evento de auditoría

**Validaciones Críticas:**
- Monto recibido debe coincidir con monto de la transacción
- Pago debe estar verificado por el proveedor
- Transacción no debe haber sido procesada previamente
- Usuario debe existir y estar activo

### 2.4 Operaciones Financieras

#### ✅ REGLA 9: Validar Saldo Antes de Descontar

**¿Por qué?**
- Previene saldos negativos
- Protege contra condiciones de carrera
- Asegura integridad financiera

**Implementación:**
```typescript
// ✅ CORRECTO: Validar saldo con bloqueo de fila
async payWithBalance(user: User, payWithBalanceDto: PayWithBalanceDto) {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  
  try {
    // 1. Validar total positivo
    if (payWithBalanceDto.total <= 0) {
      throw new BadRequestException('El total debe ser mayor a cero');
    }
    
    // 2. Validar items
    for (const item of payWithBalanceDto.items) {
      if (item.price <= 0 || item.quantity <= 0) {
        throw new BadRequestException('Precios y cantidades deben ser positivos');
      }
    }
    
    // 3. Bloquear fila de usuario (SELECT FOR UPDATE)
    const userWithLock = await queryRunner.manager
      .createQueryBuilder(User, 'user')
      .setLock('pessimistic_write') // ✅ Bloqueo pesimista
      .where('user.id = :userId', { userId: user.id })
      .getOne();
    
    // 4. Validar saldo suficiente
    const currentBalance = userWithLock.balance || 0;
    if (currentBalance < payWithBalanceDto.total) {
      throw new BadRequestException('Saldo insuficiente');
    }
    
    // 5. Calcular nuevo balance
    const newBalance = currentBalance - payWithBalanceDto.total;
    
    // 6. Validar balance no negativo
    if (newBalance < 0) {
      throw new BadRequestException('Operación resultaría en saldo negativo');
    }
    
    // 7. Actualizar balance
    await queryRunner.manager.update(User, user.id, { balance: newBalance });
    
    await queryRunner.commitTransaction();
    return { success: true, newBalance };
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

// ❌ INCORRECTO: Descontar sin validar
async payWithBalance(user: User, dto: PayWithBalanceDto) {
  // ❌ Sin validación de saldo
  // ❌ Sin bloqueo de fila (race condition)
  user.balance -= dto.total; // ❌ Puede resultar en saldo negativo
  await this.userRepository.save(user);
}
```

#### ✅ REGLA 10: Usar Transacciones para Operaciones Críticas

**¿Por qué?**
- Asegura atomicidad (todo o nada)
- Previene estados inconsistentes
- Permite rollback en caso de error

**Implementación:**
```typescript
// ✅ CORRECTO: Usar transacciones
async createOrder(user: User, createOrderDto: CreateOrderDto) {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  
  try {
    // 1. Validar stock
    await this.validateStockBeforeOrder(createOrderDto.items);
    
    // 2. Crear orden
    const order = await queryRunner.manager.save(Order, {
      user,
      items: createOrderDto.items,
      total: createOrderDto.total,
      status: OrderStatus.PENDING
    });
    
    // 3. Descontar stock
    for (const item of createOrderDto.items) {
      await queryRunner.manager.decrement(
        ProductPrices,
        { id: item.metadata.priceId },
        'stock',
        item.quantity
      );
    }
    
    // 4. Commit si todo está bien
    await queryRunner.commitTransaction();
    return order;
  } catch (error) {
    // 5. Rollback si hay error
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

// ❌ INCORRECTO: Operaciones sin transacción
async createOrder(user: User, dto: CreateOrderDto) {
  const order = await this.ordersRepository.save({ /* ... */ }); // ❌ Si falla stock, orden queda creada
  await this.decrementStock(dto.items); // ❌ Si falla, orden sin stock descontado
}
```

### 2.5 Logging y Auditoría

#### ✅ REGLA 11: Registrar Todas las Acciones Críticas

**¿Por qué?**
- Permite auditoría y detección de fraude
- Facilita investigación de incidentes
- Cumple con requisitos de compliance

**Implementación:**
```typescript
// ✅ CORRECTO: Registrar acciones críticas
import { SecurityLoggerService } from '../common/services/security-logger.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly securityLogger: SecurityLoggerService
  ) {}
  
  async updateUserBalance(
    targetUserId: string,
    amount: number,
    operation: 'add' | 'subtract' | 'set',
    operatorUserId: string,
    operatorRole: string,
    ip: string,
    userAgent: string
  ) {
    const targetUser = await this.userRepository.findOne({
      where: { id: targetUserId }
    });
    
    const previousBalance = targetUser.balance || 0;
    // ... calcular nuevo balance ...
    
    // Registrar evento de auditoría
    await this.securityLogger.logSecurityEvent(
      'BALANCE_UPDATED',
      {
        operatorUserId,
        operatorRole,
        targetUserId,
        targetUserEmail: targetUser.email,
        operation,
        amount,
        previousBalance,
        newBalance,
        ip,
        userAgent
      },
      operation === 'set' ? 'critical' : 'high'
    );
    
    await this.userRepository.update(targetUserId, { balance: newBalance });
    return { success: true, newBalance };
  }
}

// ❌ INCORRECTO: No registrar acciones críticas
async updateUserBalance(userId: string, amount: number) {
  // ❌ Sin logging, imposible auditar
  await this.userRepository.update(userId, { balance: amount });
}
```

#### ✅ REGLA 12: Registrar Intentos de Manipulación

**¿Por qué?**
- Detecta ataques en tiempo real
- Permite análisis de patrones
- Facilita respuesta a incidentes

**Implementación:**
```typescript
// ✅ CORRECTO: Registrar intentos de manipulación
async validateItemPrice(item: OrderItem, user: User, productPrice: ProductPrices) {
  const expectedPrice = await this.calculateFinalPrice(productPrice, user);
  
  if (Math.abs(item.price - expectedPrice) > 0.01) {
    // Registrar intento de manipulación
    this.securityLogger.logSecurityEvent(
      'PRICE_MANIPULATION_ATTEMPT',
      {
        userId: user.id,
        userEmail: user.email,
        productName: item.name,
        priceId: item.metadata.priceId,
        expectedPrice,
        receivedPrice: item.price,
        difference: Math.abs(item.price - expectedPrice),
        ip: req.ip,
        userAgent: req.get('user-agent')
      },
      'critical'
    );
    
    throw new BadRequestException('Precio inválido');
  }
}

// ❌ INCORRECTO: Solo rechazar sin registrar
if (item.price !== expectedPrice) {
  throw new BadRequestException('Precio inválido'); // ❌ Sin logging
}
```

#### ✅ REGLA 13: Sistema de Logs Expandido para Diferentes Eventos

**¿Por qué?**
- Diferentes tipos de eventos requieren diferentes niveles de logging
- Facilita análisis y detección de patrones de ataque
- Permite auditoría específica por tipo de evento

**Flujo de Logging por Tipo de Evento:**
1. **logSecurityEvent()**: Eventos generales de seguridad (manipulación de precios, acceso no autorizado)
2. **logDataAccessAttempt()**: Acceso a datos sensibles (listados de usuarios, transacciones)
3. **logAuthenticationFailure()**: Intentos fallidos de login (brute force, credenciales inválidas)
4. **logConfigurationChange()**: Cambios en configuración del sistema (cambios de roles, ajustes)
5. **logDataDeletion()**: Eliminación de datos críticos (soft delete, hard delete)
6. **logSuspiciousActivity()**: Actividades sospechosas (múltiples intentos, patrones anómalos)
7. **logCouponValidationFailure()**: Validaciones fallidas de cupones (roles, antigüedad, compras)

**Niveles de Severidad:**
- `critical`: Manipulación de precios, doble acreditación, operaciones financieras fraudulentas
- `high`: Acceso no autorizado, cambios de balance, operaciones administrativas
- `medium`: Validaciones fallidas de cupones, intentos de acceso a recursos
- `low`: Accesos normales, operaciones exitosas (para auditoría)

**Información Registrada:**
- Usuario que realiza la acción (ID, email, rol)
- IP address y User-Agent
- Timestamp preciso
- Detalles específicos del evento
- Resultado de la acción (éxito/fallo)

### 2.6 Separación de Endpoints por Contexto de Uso

#### ✅ REGLA 14: Crear Endpoints Separados para Diferentes Contextos

**¿Por qué?**
- **Seguridad por diseño**: Nunca expones datos sensibles accidentalmente
- **Principio de menor privilegio**: Cada endpoint devuelve exactamente lo necesario
- **Más claro y mantenible**: Es obvio qué datos expone cada endpoint
- **Mejor performance**: Puedes optimizar queries para traer solo lo necesario
- **Facilita el testing**: Puedes probar cada caso de uso independientemente

**Arquitectura de Endpoints:**

```
Endpoints Públicos (sin autenticación):
- GET /public/products → Lista de productos con info básica
- GET /public/products/:id → Detalle de producto sanitizado
- GET /public/product-prices/product/:productId → Precios públicos sin costos

Endpoints de Usuario (JWT requerido):
- GET /users/me → Perfil del usuario actual
- GET /users/me/orders → Órdenes del usuario actual
- GET /users/me/balance-transactions → Transacciones del usuario actual

Endpoints Administrativos (JWT + Role ADMIN/SUPERADMIN):
- GET /admin/users → Lista completa de usuarios con datos sensibles
- GET /admin/users/:id → Detalle completo de usuario
- GET /admin/product-prices → Precios con costos y márgenes
- GET /admin/orders → Todas las órdenes del sistema
```

**Implementación:**

```typescript
// ===========================
// 1. ENDPOINTS PÚBLICOS
// ===========================
@Controller('public/products')
export class PublicProductsController {
  constructor(private readonly productsService: ProductsService) {}
  
  // ✅ ENDPOINT PÚBLICO: Lista de productos
  @Get()
  @PublicEndpoint()
  @ApiOperation({ summary: 'Obtener lista pública de productos' })
  async findAll(@Query() query: PaginationDto) {
    // Servicio retorna SOLO datos públicos
    return this.productsService.findAllPublic(query);
  }
  
  // ✅ ENDPOINT PÚBLICO: Detalle de producto
  @Get(':id')
  @PublicEndpoint()
  @ApiOperation({ summary: 'Obtener detalle público de producto' })
  async findOne(@Param('id') id: string) {
    // Servicio retorna SOLO datos públicos
    return this.productsService.findOnePublic(id);
  }
}

@Controller('public/product-prices')
export class PublicProductPricesController {
  constructor(private readonly productPricesService: ProductPricesService) {}
  
  // ✅ ENDPOINT PÚBLICO: Precios por producto
  @Get('product/:productId')
  @PublicEndpoint()
  @ApiOperation({ summary: 'Obtener precios públicos de un producto' })
  async findByProduct(@Param('productId') productId: string) {
    // Servicio retorna SOLO precios finales, sin costos ni márgenes
    return this.productPricesService.findByProductPublic(productId);
  }
}

// ===========================
// 2. ENDPOINTS DE USUARIO
// ===========================
@Controller('users')
@UseGuards(JwtAuthGuard) // ✅ JWT requerido para todos los endpoints
export class UsersController {
  constructor(private readonly usersService: UsersService) {}
  
  // ✅ ENDPOINT DE USUARIO: Perfil propio
  @Get('me')
  @ApiOperation({ summary: 'Obtener perfil del usuario autenticado' })
  async getMyProfile(@GetUser() user: User) {
    // Usuario solo puede ver su propio perfil
    return this.usersService.getUserProfile(user.id);
  }
  
  // ✅ ENDPOINT DE USUARIO: Órdenes propias
  @Get('me/orders')
  @ApiOperation({ summary: 'Obtener órdenes del usuario autenticado' })
  async getMyOrders(
    @GetUser() user: User,
    @Query() query: PaginationDto
  ) {
    // Usuario solo puede ver sus propias órdenes
    return this.ordersService.findByUser(user.id, query);
  }
  
  // ✅ ENDPOINT DE USUARIO: Transacciones propias
  @Get('me/balance-transactions')
  @ApiOperation({ summary: 'Obtener transacciones del usuario autenticado' })
  async getMyTransactions(
    @GetUser() user: User,
    @Query() query: PaginationDto
  ) {
    // Usuario solo puede ver sus propias transacciones
    return this.balanceTransactionsService.findByUser(user.id, query);
  }
}

// ===========================
// 3. ENDPOINTS ADMINISTRATIVOS
// ===========================
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard) // ✅ JWT + Roles requeridos
@Roles(Role.ADMIN, Role.SUPERADMIN) // ✅ Solo administradores
@ApiBearerAuth()
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}
  
  // ✅ ENDPOINT ADMIN: Lista completa de usuarios
  @Get()
  @ApiOperation({ summary: '[ADMIN] Obtener todos los usuarios' })
  async findAll(@Query() query: PaginationDto) {
    // Servicio retorna datos COMPLETOS incluyendo info sensible
    return this.usersService.findAllComplete(query);
  }
  
  // ✅ ENDPOINT ADMIN: Detalle completo de usuario
  @Get(':id')
  @ApiOperation({ summary: '[ADMIN] Obtener detalle completo de usuario' })
  async findOne(@Param('id') id: string) {
    // Servicio retorna datos COMPLETOS incluyendo info sensible
    return this.usersService.findOneComplete(id);
  }
  
  // ✅ ENDPOINT ADMIN: Actualizar balance de usuario
  @Patch(':id/balance')
  @Roles(Role.SUPERADMIN) // ✅ Solo superadmin puede modificar balance
  @ApiOperation({ summary: '[SUPERADMIN] Actualizar balance de usuario' })
  async updateBalance(
    @Param('id') userId: string,
    @Body() dto: UpdateBalanceDto,
    @GetUser() operator: User,
    @Req() req: Request
  ) {
    return this.usersService.updateUserBalance(
      userId,
      dto.amount,
      dto.operation,
      operator.id,
      operator.roles,
      req.ip,
      req.get('user-agent')
    );
  }
}

@Controller('admin/product-prices')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPERADMIN)
@ApiBearerAuth()
export class AdminProductPricesController {
  constructor(private readonly productPricesService: ProductPricesService) {}
  
  // ✅ ENDPOINT ADMIN: Precios completos con costos y márgenes
  @Get()
  @ApiOperation({ summary: '[ADMIN] Obtener precios con costos y márgenes' })
  async findAll(@Query() query: PaginationDto) {
    // Servicio retorna datos COMPLETOS incluyendo costos y márgenes
    return this.productPricesService.findAllComplete(query);
  }
  
  // ✅ ENDPOINT ADMIN: Detalle completo de precio
  @Get(':id')
  @ApiOperation({ summary: '[ADMIN] Obtener detalle completo de precio' })
  async findOne(@Param('id') id: string) {
    // Servicio retorna datos COMPLETOS incluyendo costos y márgenes
    return this.productPricesService.findOneComplete(id);
  }
}

@Controller('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPERADMIN, Role.SUPPORT)
@ApiBearerAuth()
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}
  
  // ✅ ENDPOINT ADMIN: Todas las órdenes del sistema
  @Get()
  @ApiOperation({ summary: '[ADMIN] Obtener todas las órdenes' })
  async findAll(@Query() query: PaginationDto) {
    // Servicio retorna TODAS las órdenes, no solo las del usuario
    return this.ordersService.findAllComplete(query);
  }
  
  // ✅ ENDPOINT ADMIN: Detalle completo de orden
  @Get(':id')
  @ApiOperation({ summary: '[ADMIN] Obtener detalle completo de orden' })
  async findOne(@Param('id') id: string) {
    // Servicio retorna datos COMPLETOS sin restricciones de propiedad
    return this.ordersService.findOneComplete(id);
  }
}
```

**Servicios con Métodos Separados:**

```typescript
// ===========================
// SERVICES: Métodos separados por contexto
// ===========================

@Injectable()
export class ProductsService {
  // Método PÚBLICO: Solo datos básicos
  async findAllPublic(query: PaginationDto): Promise<PublicProductDto[]> {
    const products = await this.productRepository.find({
      where: { state: 'active' },
      select: ['id', 'name', 'description', 'image', 'category', 'state']
      // ❌ NO seleccionar: internalNotes, supplierId, etc.
    });
    
    return products.map(product => this.toPublicDto(product));
  }
  
  // Método COMPLETO: Para administradores
  async findAllComplete(query: PaginationDto): Promise<CompleteProductDto[]> {
    const products = await this.productRepository.find({
      // ✅ Seleccionar TODOS los campos
      relations: ['supplier', 'prices']
    });
    
    return products.map(product => this.toCompleteDto(product));
  }
  
  private toPublicDto(product: Product): PublicProductDto {
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      image: product.image,
      category: product.category,
      state: product.state
      // ❌ NO incluir: internalNotes, supplierId, etc.
    };
  }
  
  private toCompleteDto(product: Product): CompleteProductDto {
    return {
      ...product, // ✅ Todos los campos
      supplier: product.supplier,
      prices: product.prices
    };
  }
}

@Injectable()
export class ProductPricesService {
  // Método PÚBLICO: Solo precios finales
  async findByProductPublic(productId: string): Promise<PublicPriceDto[]> {
    const prices = await this.productPriceRepository.find({
      where: { productId, state: 'active' },
      select: ['id', 'name', 'price', 'discountPercentage', 'stock', 'state']
      // ❌ NO seleccionar: purchaseCost, margins, supplier IDs
    });
    
    return prices.map(price => ({
      id: price.id,
      name: price.name,
      finalPrice: this.calculateFinalPriceSync(price),
      discountPercentage: price.discountPercentage,
      isOffer: !!(price.discountPercentage && price.discountPercentage > 0),
      stock: price.stock,
      state: price.state
      // ❌ NO incluir: purchaseCost, finalCustomerMargin, etc.
    }));
  }
  
  // Método COMPLETO: Para administradores
  async findAllComplete(query: PaginationDto): Promise<CompletePriceDto[]> {
    const prices = await this.productPriceRepository.find({
      // ✅ Seleccionar TODOS los campos
      relations: ['product']
    });
    
    return prices; // ✅ Retornar todo, incluyendo costos y márgenes
  }
}

@Injectable()
export class UsersService {
  // Método para USUARIO: Solo su perfil
  async getUserProfile(userId: string): Promise<UserProfileDto> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'email', 'userName', 'balance', 'roles', 'registrationDate']
      // ❌ NO seleccionar: passwordHash, internalNotes, etc.
    });
    
    return {
      id: user.id,
      email: user.email,
      userName: user.userName,
      balance: user.balance,
      roles: user.roles,
      memberSince: user.registrationDate
      // ❌ NO incluir: passwordHash, internalNotes, etc.
    };
  }
  
  // Método COMPLETO: Para administradores
  async findAllComplete(query: PaginationDto): Promise<CompleteUserDto[]> {
    const users = await this.userRepository.find({
      // ✅ Seleccionar TODOS los campos
      relations: ['orders', 'transactions']
    });
    
    return users; // ✅ Retornar todo, incluyendo datos sensibles
  }
}
```

**DTOs Separados:**

```typescript
// ===========================
// DTOs PÚBLICOS
// ===========================
export class PublicProductDto {
  id: string;
  name: string;
  description: string;
  image: string;
  category: string;
  state: string;
  // ❌ NO incluir: internalNotes, supplierId, etc.
}

export class PublicPriceDto {
  id: string;
  name: string;
  finalPrice: number;
  discountPercentage?: number;
  isOffer: boolean;
  stock: number;
  state: string;
  // ❌ NO incluir: purchaseCost, margins, supplier IDs
}

// ===========================
// DTOs DE USUARIO
// ===========================
export class UserProfileDto {
  id: string;
  email: string;
  userName: string;
  balance: number;
  roles: string[];
  memberSince: Date;
  // ❌ NO incluir: passwordHash, internalNotes, etc.
}

// ===========================
// DTOs ADMINISTRATIVOS
// ===========================
export class CompleteProductDto {
  id: string;
  name: string;
  description: string;
  image: string;
  category: string;
  state: string;
  internalNotes: string; // ✅ Incluir campos internos
  supplierId: string;
  supplier: Supplier;
  prices: ProductPrices[];
  // ✅ Todos los campos disponibles
}

export class CompletePriceDto {
  id: string;
  name: string;
  price: number;
  purchaseCost: number; // ✅ Incluir costo
  finalCustomerMargin: number; // ✅ Incluir margen
  discountPercentage?: number;
  stock: number;
  state: string;
  // ✅ Campos adicionales de integración con proveedores (según tu implementación)
  // ✅ Todos los campos disponibles para administradores
}

export class CompleteUserDto {
  id: string;
  email: string;
  userName: string;
  balance: number;
  roles: string[];
  registrationDate: Date;
  passwordHash: string; // ✅ Incluir para admin (si es necesario)
  internalNotes: string;
  orders: Order[];
  transactions: BalanceTransaction[];
  // ✅ Todos los campos disponibles
}
```

**Ventajas de esta Arquitectura:**

✅ **Seguridad por Diseño**
- Los endpoints públicos NUNCA pueden exponer datos sensibles por error
- Cada endpoint tiene su propósito claro y limitado

✅ **Mantenibilidad**
- Es obvio qué hace cada endpoint con solo ver la ruta
- Los cambios en lógica de negocio no afectan endpoints no relacionados

✅ **Performance**
- Queries optimizadas para cada caso de uso
- No se trae información innecesaria

✅ **Testing**
- Cada endpoint se puede probar independientemente
- Tests más simples y claros


**❌ Evitar:**

```typescript
// ❌ INCORRECTO: Un solo endpoint con parámetro isPublic
@Get('products')
async findAll(@Query('isPublic') isPublic: boolean) {
  if (isPublic) {
    return this.productsService.findAllPublic();
  }
  return this.productsService.findAllComplete();
}
// Problemas:
// - No está claro qué endpoint usar
// - Fácil olvidar el parámetro y exponer datos sensibles
// - Difícil de mantener y testear
// - Guard tiene que validar el parámetro también

// ❌ INCORRECTO: Sanitizar en el mismo servicio
async findAll(userId: string, isAdmin: boolean) {
  const products = await this.productRepository.find();
  
  if (!isAdmin) {
    // ❌ Sanitizar en runtime es propenso a errores
    return products.map(p => this.sanitize(p));
  }
  
  return products;
}
// Problemas:
// - Fácil olvidar sanitizar un campo nuevo
// - Lógica de negocio mezclada con seguridad
// - Difícil de testear todas las combinaciones
```

#### ✅ REGLA 15: NO Requerir X-Client-Secret para Peticiones del Frontend

**¿Por qué?**
- ⚠️ **VULNERABILIDAD CRÍTICA**: El X-Client-Secret NO debe venir del frontend
- Cualquiera puede verlo en las DevTools del navegador
- El secret solo debe usarse para validación de servicios internos/backends
- Los endpoints protegidos deben usar JWT tokens para autenticación

**Flujo de Validación:**
1. **Endpoints Públicos**: `@PublicEndpoint()` - No requieren nada
2. **Endpoints con JWT**: Si tiene `Authorization: Bearer <token>` → Permitir
3. **Servicios Internos**: Si no tiene JWT pero tiene `X-Client-Secret` válido → Permitir
4. **Sin JWT ni Secret**: Rechazar

**Implementación:**
```typescript
// ✅ CORRECTO: ClientSecretGuard actualizado
canActivate(context: ExecutionContext) {
  const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ENDPOINT_KEY, [
    context.getHandler(),
    context.getClass(),
  ]);

  if (isPublic) {
    return true; // ✅ Endpoints públicos permitidos
  }

  const request = context.switchToHttp().getRequest();
  const hasJwtToken = request.headers['authorization']?.startsWith('Bearer ');
  
  // ✅ Si tiene JWT, permitir (es del frontend autenticado)
  if (hasJwtToken) {
    return true;
  }

  // Solo validar X-Client-Secret para peticiones sin JWT (servicios internos)
  const clientSecret = request.headers['x-client-secret'];
  if (!clientSecret) {
    throw new ForbiddenException('Se requiere autenticación (JWT) o header X-Client-Secret');
  }
  
  // Validar secret solo para servicios internos
  if (clientSecret !== this.clientSecret) {
    throw new ForbiddenException('Header X-Client-Secret inválido');
  }
  
  return true;
}

// ❌ INCORRECTO: Requerir X-Client-Secret para todas las peticiones
canActivate(context: ExecutionContext) {
  const clientSecret = request.headers['x-client-secret'];
  if (!clientSecret || clientSecret !== this.clientSecret) {
    throw new ForbiddenException(); // ❌ Bloquea peticiones del frontend con JWT
  }
}
```

### 2.7 Validación de Cupones y Promociones

#### ✅ REGLA 16: Validar Restricciones de Cupones

**¿Por qué?**
- Previene uso no autorizado de cupones
- Protege promociones exclusivas
- Evita fraude con múltiples cuentas

**Implementación:**
```typescript
// ✅ CORRECTO: Validar todas las restricciones
async redeemCoupon(user: User, couponCode: string) {
  const coupon = await this.couponRepository.findOne({
    where: { code: couponCode }
  });
  
  // 1. Validar rol
  if (coupon.allowedRoles && !coupon.allowedRoles.includes(user.roles)) {
    this.securityLogger.logSecurityEvent(
      'COUPON_REDEEM_UNAUTHORIZED_ROLE',
      { userId: user.id, couponCode, userRole: user.roles },
      'medium'
    );
    return { success: false, message: 'Este cupón no está disponible para tu tipo de cuenta' };
  }
  
  // 2. Validar antigüedad de cuenta
  if (coupon.minAccountAgeDays) {
    const accountAge = this.calculateAccountAge(user.registrationDate);
    if (accountAge < coupon.minAccountAgeDays) {
      this.securityLogger.logSecurityEvent(
        'COUPON_REDEEM_INSUFFICIENT_ACCOUNT_AGE',
        { userId: user.id, couponCode, accountAge, required: coupon.minAccountAgeDays },
        'medium'
      );
      return { success: false, message: 'Tu cuenta no cumple con la antigüedad requerida' };
    }
  }
  
  // 3. Validar compras previas
  if (coupon.minPreviousPurchases) {
    const previousPurchases = await this.ordersRepository.count({
      where: { user: { id: user.id }, status: OrderStatus.COMPLETED }
    });
    if (previousPurchases < coupon.minPreviousPurchases) {
      this.securityLogger.logSecurityEvent(
        'COUPON_REDEEM_INSUFFICIENT_PURCHASES',
        { userId: user.id, couponCode, purchases: previousPurchases, required: coupon.minPreviousPurchases },
        'medium'
      );
      return { success: false, message: 'No cumples con el número mínimo de compras requeridas' };
    }
  }
  
  // Continuar con canje...
}

// ❌ INCORRECTO: No validar restricciones
async redeemCoupon(user: User, code: string) {
  const coupon = await this.findCoupon(code);
  // ❌ Cualquiera puede canjear cualquier cupón
  return this.applyCoupon(coupon);
}
```

### 2.8 Rate Limiting y Protección contra Abuso

#### ✅ REGLA 17: Implementar Rate Limiting en Endpoints Sensibles

**¿Por qué?**
- Previene ataques de fuerza bruta (brute force)
- Limita abuso de recursos del servidor
- Protege contra ataques de denegación de servicio (DoS)
- Previene scraping automatizado

**Flujo de Rate Limiting:**
1. **RateLimitGuard**: Intercepta peticiones antes de procesarlas
2. **Generar Clave Única**: Basada en IP address + User ID (si está autenticado)
3. **Verificar Límite**: Contar peticiones en ventana de tiempo configurada
4. **Si excede límite**: Rechazar con HTTP 429 (Too Many Requests) y tiempo de espera
5. **Si está dentro del límite**: Permitir y actualizar contador
6. **Limpieza Automática**: Eliminar registros expirados periódicamente

**Endpoints que DEBEN tener Rate Limiting:**
- `POST /auth/login` - Máximo 5 intentos por IP cada 5 minutos
- `POST /user/coupons/redeem` - Máximo 10 canjes por usuario cada hora
- `PATCH /users/balance` - Máximo 20 operaciones por usuario cada hora
- `POST /payments/orders/:id/create-session` - Máximo 5 sesiones por usuario cada minuto
- `POST /orders` - Máximo 10 órdenes por usuario cada minuto

**Configuración por Endpoint:**
- Usar decorador `@RateLimit({ ttl: 300000, limit: 5 })` para configurar límites específicos
- `ttl`: Tiempo de vida en milisegundos (ventana de tiempo)
- `limit`: Número máximo de peticiones permitidas en esa ventana

## 3. Checklist de Seguridad Backend

### Antes de Crear un Endpoint

- [ ] ¿He identificado el contexto de uso del endpoint (público, usuario, admin)?
- [ ] ¿He creado endpoints separados para cada contexto en lugar de sanitizar?
- [ ] ¿El endpoint público está en su propio controller bajo `/public/*`?
- [ ] ¿El endpoint de usuario está en su controller con JWT guard?
- [ ] ¿El endpoint administrativo está en `/admin/*` con JWT + Roles guards?
- [ ] ¿Tiene rate limiting si es un endpoint sensible (login, pagos, recargas)?
- [ ] ¿Se valida la propiedad de recursos (si aplica)?
- [ ] ¿Los datos del cliente se validan en múltiples capas (DTOs, Guards, Services)?
- [ ] ¿Se usan servicios de validación (OrderValidationService, RechargeValidationService)?
- [ ] ¿Los precios se recalculan desde la base de datos (NO se confía en el cliente)?
- [ ] ¿Los totales se calculan en el servidor (NO se aceptan del cliente)?
- [ ] ¿Se usan DTOs con validaciones?
- [ ] ¿Las operaciones críticas usan transacciones con locks?
- [ ] ¿Se valida saldo antes de descontar (si aplica)?
- [ ] ¿Se verifica pago real con proveedor antes de acreditar (si aplica)?
- [ ] ¿Se registran acciones críticas en logs con nivel de severidad apropiado?
- [ ] ¿Los errores no exponen información sensible?
- [ ] ¿El servicio tiene métodos separados (findAllPublic, findAllComplete)?
- [ ] ¿Los DTOs están separados (PublicDto, UserDto, CompleteDto)?

### Antes de Hacer Commit

- [ ] ¿Todos los endpoints públicos están bajo `/public/*`?
- [ ] ¿Todos los endpoints administrativos están bajo `/admin/*` con `@Roles()`?
- [ ] ¿Los servicios tienen métodos separados para cada contexto?
- [ ] ¿Las validaciones de precios están implementadas usando OrderValidationService?
- [ ] ¿Las recargas verifican pagos reales con proveedores usando RechargeValidationService?
- [ ] ¿Las operaciones financieras usan bloqueo de fila (SELECT FOR UPDATE)?
- [ ] ¿Los logs de seguridad están implementados con niveles de severidad apropiados?
- [ ] ¿El rate limiting está aplicado en endpoints sensibles?
- [ ] ¿No hay secretos hardcodeados?
- [ ] ¿Las variables de entorno están configuradas?

### Antes de Desplegar a Producción

- [ ] ¿El `ClientSecretGuard` permite JWT sin requerir X-Client-Secret?
- [ ] ¿Los endpoints están correctamente segregados (public/, user/, admin/)?
- [ ] ¿Los servicios no mezclan lógica de sanitización con lógica de negocio?
- [ ] ¿Los logs se están generando correctamente con niveles de severidad apropiados?
- [ ] ¿Las validaciones están funcionando en todas las capas (DTOs, Guards, Services)?
- [ ] ¿Los servicios de validación (OrderValidationService, RechargeValidationService) están siendo usados?
- [ ] ¿Los precios se recalculan desde la base de datos en todas las órdenes?
- [ ] ¿Los pagos se verifican con proveedores externos antes de acreditar saldo?
- [ ] ¿El rate limiting está aplicado en endpoints sensibles (login, pagos, recargas)?
- [ ] ¿Los roles están correctamente asignados?
- [ ] ¿Todos los endpoints no públicos requieren JWT?
- [ ] ¿Los endpoints administrativos requieren roles específicos?

## 4. Errores Comunes a Evitar

### ❌ Error 1: Confiar en Datos del Cliente

```typescript
// ❌ MAL
async createOrder(dto: CreateOrderDto) {
  const total = dto.items.reduce((sum, item) => 
    sum + item.price * item.quantity, 0
  );
  // ❌ Usa precio del cliente
}

// ✅ BIEN
async createOrder(dto: CreateOrderDto) {
  // Validar precios contra valores calculados
  for (const item of dto.items) {
    const expectedPrice = await this.calculatePrice(item);
    if (item.price !== expectedPrice) {
      throw new BadRequestException('Precio inválido');
    }
  }
}
```

### ❌ Error 2: No Validar Propiedad de Recursos

```typescript
// ❌ MAL
@Get('orders/:id')
getOrder(@Param('id') id: string) {
  return this.ordersService.findOne(id); // ❌ Cualquiera puede ver cualquier orden
}

// ✅ BIEN
@Get('orders/:id')
@UseGuards(JwtAuthGuard)
getOrder(@Param('id') id: string, @Request() req) {
  const order = await this.ordersService.findOne(id);
  if (order.user.id !== req.user.id && !isAdmin(req.user)) {
    throw new ForbiddenException();
  }
  return order;
}
```

### ❌ Error 3: Operaciones Sin Transacciones

```typescript
// ❌ MAL
async createOrder(dto: CreateOrderDto) {
  const order = await this.ordersRepository.save({ /* ... */ });
  await this.decrementStock(dto.items); // ❌ Si falla, orden queda sin stock descontado
}

// ✅ BIEN
async createOrder(dto: CreateOrderDto) {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.startTransaction();
  try {
    const order = await queryRunner.manager.save(Order, { /* ... */ });
    await this.decrementStock(dto.items, queryRunner);
    await queryRunner.commitTransaction();
    return order;
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  }
}
```

### ❌ Error 4: Sanitizar en el Mismo Endpoint

```typescript
// ❌ MAL: Sanitizar en runtime
@Get('products')
async findAll(@Query('isPublic') isPublic: boolean) {
  const products = await this.productsService.findAll();
  
  if (isPublic) {
    // ❌ Fácil olvidar sanitizar un campo
    return products.map(p => this.sanitize(p));
  }
  
  return products;
}

// ✅ BIEN: Endpoints separados
@Controller('public/products')
export class PublicProductsController {
  @Get()
  @PublicEndpoint()
  findAll() {
    // ✅ Servicio solo retorna datos públicos
    return this.productsService.findAllPublic();
  }
}

@Controller('admin/products')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminProductsController {
  @Get()
  findAll() {
    // ✅ Servicio retorna datos completos
    return this.productsService.findAllComplete();
  }
}
```

## 5. Patrones de Seguridad Recomendados

### Patrón 1: Defense in Depth (Defensa en Profundidad)

```typescript
// Múltiples capas de validación
async createOrder(dto: CreateOrderDto) {
  // Capa 1: Validación de DTO
  // Capa 2: Validación de stock
  await this.validateStockBeforeOrder(dto.items);
  
  // Capa 3: Validación de precios
  await this.validateItemPrices(dto.items, user);
  
  // Capa 4: Validación de saldo (si aplica)
  if (dto.paymentMethod === 'balance') {
    await this.validateBalance(user, dto.total);
  }
  
  // Capa 5: Transacción atómica
  return await this.createOrderTransaction(dto, user);
}
```

### Patrón 2: Fail Secure (Fallar de Forma Segura)

```typescript
// En caso de duda, rechazar
async validateAccess(userId: string, resourceId: string) {
  try {
    const resource = await this.getResource(resourceId);
    const hasAccess = await this.checkAccess(userId, resource);
    
    // Si no se puede verificar, rechazar
    if (hasAccess === null || hasAccess === undefined) {
      this.logger.warn('No se pudo verificar acceso, rechazando');
      throw new ForbiddenException();
    }
    
    return hasAccess;
  } catch (error) {
    // En caso de error, rechazar
    throw new ForbiddenException();
  }
}
```

### Patrón 3: Separation of Concerns (Separación de Responsabilidades)

```typescript
// ✅ CORRECTO: Servicios y endpoints separados

// Servicio con métodos específicos
@Injectable()
export class ProductsService {
  async findAllPublic(): Promise<PublicProductDto[]> {
    // Lógica para datos públicos
  }
  
  async findAllComplete(): Promise<CompleteProductDto[]> {
    // Lógica para datos completos
  }
}

// Controllers separados
@Controller('public/products')
export class PublicProductsController {
  @Get()
  @PublicEndpoint()
  findAll() {
    return this.productsService.findAllPublic();
  }
}

@Controller('admin/products')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminProductsController {
  @Get()
  findAll() {
    return this.productsService.findAllComplete();
  }
}
```

## 6. Referencias

- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [NestJS Guards](https://docs.nestjs.com/guards)
- [NestJS Validation](https://docs.nestjs.com/techniques/validation)
- [TypeORM Transactions](https://typeorm.io/transactions)
- [Separation of Concerns Principle](https://en.wikipedia.org/wiki/Separation_of_concerns)

## 7. Changelog

### Versión 2.0 (2026-01-17)
- **BREAKING CHANGE**: Cambio de sanitización a endpoints separados
- **REGLA 14 REESCRITA**: Crear endpoints separados por contexto (público, usuario, admin)
- **Arquitectura Actualizada**: Controllers separados por contexto (/public/*, /admin/*)
- **Servicios Refactorizados**: Métodos separados (findAllPublic, findAllComplete)
- **DTOs Separados**: PublicDto, UserDto, CompleteDto para cada contexto
- **Checklist Actualizado**: Verificar separación de endpoints y servicios
- **Ejemplos Mejorados**: Código más claro mostrando la arquitectura correcta
- **Patrones Agregados**: Separation of Concerns como patrón recomendado

### Versión 1.3 (2026-01-XX)
- **REGLA 7 NUEVA**: Recalcular precios desde base de datos en órdenes (OrderValidationService)
- **REGLA 8 NUEVA**: Validar y verificar pagos reales en recargas (RechargeValidationService)
- **REGLA 17 NUEVA**: Rate limiting para prevenir abuso (RateLimitGuard)
- **REGLA 4 ACTUALIZADA**: Flujo de validación en múltiples capas documentado
- **REGLA 13 NUEVA**: Sistema de logs expandido para diferentes tipos de eventos
- **REGLA 16 ACTUALIZADA**: Validación completa de restricciones de cupones (roles, antigüedad, compras)
- Actualizado checklist: verificar uso de servicios de validación y rate limiting
- Mitigación de vulnerabilidades críticas:
  - Manipulación de precios en órdenes
  - Manipulación de cantidades negativas
  - Acreditación de saldo sin pago real
  - Doble acreditación de recargas
  - Ataques de fuerza bruta

### Versión 1.2 (2026-01-XX)
- **REGLA 18 ACTUALIZADA**: Protección de endpoints con JWT y roles (no X-Client-Secret)
- **REGLA 19 NUEVA**: Sanitización de respuestas públicas (no exponer información sensible)
- **REGLA 20 NUEVA**: NO requerir X-Client-Secret para peticiones del frontend
- **Flujo de Seguridad**: Documentado flujo correcto de autenticación y autorización
- Actualizado checklist: verificar sanitización de respuestas públicas
- Mitigación de vulnerabilidades críticas:
  - Exposición de X-Client-Secret en Network tab
  - Exposición de códigos reales de productos
  - Exposición de información sensible (purchaseCost, márgenes, IDs internos)

### Versión 1.1 (2026-01-XX)
- Agregadas reglas de validación de cupones y promociones
- Agregadas reglas de enmascaramiento de datos sensibles

### Versión 1.0 (2026-01-11)
- Documento inicial con reglas de seguridad para backend
- Basado en vulnerabilidades identificadas y mitigaciones implementadas

---

**Nota:** Este documento debe actualizarse cuando se identifiquen nuevas vulnerabilidades o se implementen nuevas medidas de seguridad.