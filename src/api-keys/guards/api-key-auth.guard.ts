import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeysService } from '../api-keys.service';
import { ApiKey } from '../entities/api-key.entity';

export const API_KEY_PROP = 'apiKey';

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const publishableKey = request.headers['x-api-key'];
    const secret = request.headers['x-secret-key'];

    if (!publishableKey || !secret) {
      throw new UnauthorizedException(
        'Se requieren x-api-key y x-secret-key en los headers',
      );
    }

    const apiKey = await this.apiKeysService.validateKeys(
      String(publishableKey).trim(),
      String(secret).trim(),
    );

    if (!apiKey) {
      throw new UnauthorizedException(
        'API key inválida, revocada o deshabilitada por administración',
      );
    }

    request[API_KEY_PROP] = apiKey as ApiKey;
    return true;
  }
}
