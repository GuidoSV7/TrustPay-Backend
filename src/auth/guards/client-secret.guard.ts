import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * REGLA 20: ClientSecretGuard actualizado
 * - Endpoints públicos (@Public()): No requieren autenticación
 * - Endpoints con JWT: Permitidos sin requerir X-Client-Secret
 * - Servicios internos sin JWT: Deben validar X-Client-Secret
 */
@Injectable()
export class ClientSecretGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private configService: ConfigService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // REGLA 20: Verificar si el endpoint es público
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      // ✅ Endpoints públicos permitidos sin autenticación
      return true;
    }

    const request = context.switchToHttp().getRequest();
    
    // REGLA 20: Si tiene JWT token, permitir (es del frontend autenticado)
    const hasJwtToken = request.headers['authorization']?.startsWith('Bearer ');
    if (hasJwtToken) {
      // ✅ Frontend autenticado con JWT, no requiere X-Client-Secret
      return true;
    }

    // REGLA 20: Solo validar X-Client-Secret para servicios internos sin JWT
    const clientSecret = request.headers['x-client-secret'];
    const expectedSecret = this.configService.get<string>('CLIENT_SECRET');

    if (!expectedSecret) {
      // Si no hay CLIENT_SECRET configurado, permitir (modo desarrollo)
      // En producción, esto debe estar configurado
      return true;
    }

    if (!clientSecret || clientSecret !== expectedSecret) {
      throw new ForbiddenException(
        'Se requiere autenticación (JWT) o header X-Client-Secret válido'
      );
    }

    // ✅ Servicio interno con X-Client-Secret válido
    return true;
  }
}
