import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeederService } from './seeder/seeder.service';
import { User } from './users/entities/user.entity';
import { typeOrmConfig } from './config/typeorm.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: typeOrmConfig,
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([User]),
  ],
  providers: [SeederService],
})
class SeedCliModule {}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(SeedCliModule);
  const seeder = app.get(SeederService);
  await seeder.seed();
  await app.close();
}

bootstrap();
