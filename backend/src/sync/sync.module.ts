import { Module } from '@nestjs/common';
import { SupabaseReplicatorService } from './supabase-replicator.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [SupabaseReplicatorService],
  exports: [SupabaseReplicatorService],
})
export class SyncModule {}
