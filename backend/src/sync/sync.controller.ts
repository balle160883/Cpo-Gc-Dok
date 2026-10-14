import { Controller, Post, UseGuards } from '@nestjs/common';
import { SupabaseReplicatorService } from './supabase-replicator.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('sync')
export class SyncController {
  constructor(private readonly replicator: SupabaseReplicatorService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('repair-avales')
  async triggerRepair() {
    await this.replicator.autoRepairAvalesStatus();
    return {
      success: true,
      message: 'Proceso de auto-reparación de avales ejecutado correctamente en Dokploy y Supabase Cloud.'
    };
  }
}
