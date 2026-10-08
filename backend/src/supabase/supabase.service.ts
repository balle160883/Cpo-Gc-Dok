import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  private cloudClient: SupabaseClient | null = null;

  constructor(private databaseService: DatabaseService) {
    this.logger.log('🚀 SupabaseService redirigido a PostgreSQL Dokploy.');
  }

  getClient() {
    return this.databaseService.getClient();
  }

  from(tableName: string) {
    return this.databaseService.from(tableName);
  }

  getCloudClient(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    if (!url || !key) return null;
    if (!this.cloudClient) {
      this.cloudClient = createClient(url, key);
    }
    return this.cloudClient;
  }

  // SQL raw con parámetros, para JOINs que no soporta el QueryBuilder
  async query(text: string, params?: any[]) {
    return this.databaseService.query(text, params);
  }
}

