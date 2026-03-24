import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ApiKey } from '../entities/api-key.entity';
import { API_KEY_PROP } from '../guards/api-key-auth.guard';

export const ApiKeyBusiness = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): ApiKey => {
    const request = ctx.switchToHttp().getRequest();
    return request[API_KEY_PROP];
  },
);
