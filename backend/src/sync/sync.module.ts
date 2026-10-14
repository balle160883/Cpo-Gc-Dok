import { Module } from '@nestjs/common';
import { SupabaseReplicatorService } from './supabase-replicator.service';
import { SyncController } from './sync.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [SyncController],
  providers: [SupabaseReplicatorService],
  exports: [SupabaseReplicatorService],
})
export class SyncModule {}
