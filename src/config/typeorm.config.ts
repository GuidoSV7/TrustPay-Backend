import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '../users/entities/user.entity';
import { Business } from '../businesses/entities/business.entity';
import { QrCode } from '../qr-codes/entities/qr-code.entity';
import { ApiKey } from '../api-keys/entities/api-key.entity';
import { WebhookEndpoint } from '../webhooks/entities/webhook-endpoint.entity';
import { WebhookSubscription } from '../webhooks/entities/webhook-subscription.entity';
import { WebhookDelivery } from '../webhooks/entities/webhook-delivery.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Payment } from '../payments/entities/payment.entity';
import { PlatformSettings } from '../platform-settings/entities/platform-settings.entity';

export const typeOrmEntities = [
  User,
  Business,
  QrCode,
  ApiKey,
  WebhookEndpoint,
  WebhookSubscription,
  WebhookDelivery,
  Transaction,
  Payment,
  PlatformSettings,
];

function pgSsl(configService: ConfigService): boolean | object {
  const ssl =
    configService.get('DATABASE_SSL') === 'true' ||
    configService.get('DB_SSL') === 'true';
  if (!ssl) return false;
  return { rejectUnauthorized: false };
}

export const typeOrmConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const host =
    configService.get('DB_HOST') ||
    configService.get('DATABASE_HOST') ||
    'localhost';
  const port = parseInt(
    configService.get('DB_PORT') ||
      configService.get('DATABASE_PORT') ||
      '5432',
    10,
  );
  const username =
    configService.get('DB_USERNAME') ||
    configService.get('DATABASE_USER') ||
    'postgres';
  const password =
    configService.get('DB_PASSWORD') ||
    configService.get('DATABASE_PASS') ||
    'postgres';
  const database =
    configService.get('DB_NAME') ||
    configService.get('DATABASE_NAME') ||
    'trustpay';

  return {
    type: 'postgres',
    host,
    port,
    username,
    password,
    database,
    entities: typeOrmEntities,
    synchronize: configService.get('TYPEORM_SYNCHRONIZE') !== 'false',
    logging: configService.get('TYPEORM_LOGGING') === 'true',
    ssl: host !== 'localhost' && host !== '127.0.0.1'
      ? pgSsl(configService) || { rejectUnauthorized: false }
      : false,
  };
};
