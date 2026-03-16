import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { WebhooksService } from './webhooks.service';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { paginationSchema } from '../common/schemas/pagination.schema';
import { createWebhookEndpointSchema } from './schemas/create-webhook-endpoint.schema';
import { updateWebhookEndpointSchema } from './schemas/update-webhook-endpoint.schema';
import { addSubscriptionSchema } from './schemas/add-subscription.schema';
import { testDeliveryBodySchema } from './schemas/test-delivery-body.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@Controller('businesses/:businessId/webhooks')
@UseGuards(JwtAuthGuard)
export class WebhooksController {
  constructor(
    private readonly webhooks: WebhooksService,
    private readonly delivery: WebhookDeliveryService,
  ) {}

  @Post('endpoints')
  createEndpoint(
    @Param('businessId') businessId: string,
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(createWebhookEndpointSchema)) dto: z.infer<typeof createWebhookEndpointSchema>,
  ) {
    return this.webhooks.createEndpoint(businessId, user.id, user.role, dto);
  }

  @Get('endpoints')
  listEndpoints(
    @Param('businessId') businessId: string,
    @CurrentUser() user: User,
    @Query(new ZodValidationPipe(paginationSchema)) pagination: z.infer<typeof paginationSchema>,
  ) {
    return this.webhooks.listEndpoints(
      businessId,
      user.id,
      user.role,
      pagination,
    );
  }

  @Patch('endpoints/:endpointId')
  updateEndpoint(
    @Param('businessId') businessId: string,
    @Param('endpointId') endpointId: string,
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(updateWebhookEndpointSchema)) dto: z.infer<typeof updateWebhookEndpointSchema>,
  ) {
    return this.webhooks.updateEndpoint(
      endpointId,
      businessId,
      user.id,
      user.role,
      dto,
    );
  }

  @Delete('endpoints/:endpointId')
  deleteEndpoint(
    @Param('businessId') businessId: string,
    @Param('endpointId') endpointId: string,
    @CurrentUser() user: User,
  ) {
    return this.webhooks.deleteEndpoint(
      endpointId,
      businessId,
      user.id,
      user.role,
    );
  }

  @Post('endpoints/:endpointId/subscriptions')
  addSubscription(
    @Param('businessId') businessId: string,
    @Param('endpointId') endpointId: string,
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(addSubscriptionSchema)) dto: z.infer<typeof addSubscriptionSchema>,
  ) {
    return this.webhooks.addSubscription(
      endpointId,
      businessId,
      user.id,
      user.role,
      dto.eventType,
    );
  }

  @Get('endpoints/:endpointId/subscriptions')
  listSubs(
    @Param('businessId') businessId: string,
    @Param('endpointId') endpointId: string,
    @CurrentUser() user: User,
    @Query(new ZodValidationPipe(paginationSchema)) pagination: z.infer<typeof paginationSchema>,
  ) {
    return this.webhooks.listSubscriptions(
      endpointId,
      businessId,
      user.id,
      user.role,
      pagination,
    );
  }

  @Delete('endpoints/:endpointId/subscriptions/:subId')
  removeSub(
    @Param('businessId') businessId: string,
    @Param('endpointId') endpointId: string,
    @Param('subId') subId: string,
    @CurrentUser() user: User,
  ) {
    return this.webhooks.removeSubscription(
      subId,
      endpointId,
      businessId,
      user.id,
      user.role,
    );
  }

  /** Prueba: disparar evento (integrar luego con pagos reales) */
  @Post('test-dispatch')
  async testDispatch(
    @Param('businessId') businessId: string,
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(testDeliveryBodySchema)) body: z.infer<typeof testDeliveryBodySchema>,
  ) {
    await this.webhooks.assertBusinessAccess(businessId, user.id, user.role);
    await this.delivery.dispatch(
      businessId,
      body.eventType,
      body.payload ?? {},
    );
    return { ok: true };
  }

  @Post('process-retries')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  processRetries() {
    return this.delivery.processPendingRetries();
  }
}
