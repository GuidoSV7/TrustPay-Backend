import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiKeyAuthGuard } from '../api-keys/guards/api-key-auth.guard';
import { ApiKeyBusiness } from '../api-keys/decorators/api-key.decorator';
import { ApiKey } from '../api-keys/entities/api-key.entity';
import { BusinessesService } from './businesses.service';

/**
 * Negocios para integradores (mismos headers que /api/payments).
 * Sirve para obtener `businessId`, nombre y wallet antes de POST /api/payments/qr.
 */
@Controller('api/businesses')
export class ApiPublicBusinessesController {
  constructor(private readonly svc: BusinessesService) {}

  @Get()
  @UseGuards(ApiKeyAuthGuard)
  list(@ApiKeyBusiness() apiKey: ApiKey) {
    return this.svc.findForApiKey(apiKey);
  }

  @Get(':businessId')
  @UseGuards(ApiKeyAuthGuard)
  getOne(
    @ApiKeyBusiness() apiKey: ApiKey,
    @Param('businessId') businessId: string,
  ) {
    return this.svc.findOneForApiKey(apiKey, businessId);
  }
}
