import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformSettings } from './entities/platform-settings.entity';
import type { PatchCommissionDto } from './schemas/commission.schema';

const SETTINGS_ROW_ID = 'default';

@Injectable()
export class PlatformSettingsService {
  constructor(
    @InjectRepository(PlatformSettings)
    private readonly repo: Repository<PlatformSettings>,
  ) {}

  async getOrCreate(): Promise<PlatformSettings> {
    let row = await this.repo.findOne({ where: { id: SETTINGS_ROW_ID } });
    if (!row) {
      row = this.repo.create({
        id: SETTINGS_ROW_ID,
        commissionBps: 100, // 1% por defecto
      });
      await this.repo.save(row);
    }
    return row;
  }

  async getCommissionBps(): Promise<number> {
    const row = await this.getOrCreate();
    return row.commissionBps;
  }

  async setCommissionBps(dto: PatchCommissionDto): Promise<PlatformSettings> {
    const row = await this.getOrCreate();
    row.commissionBps = dto.commissionBps;
    return this.repo.save(row);
  }
}
