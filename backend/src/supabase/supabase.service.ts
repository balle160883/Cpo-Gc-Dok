import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);

  constructor(private databaseService: DatabaseService) {
    this.logger.log('🚀 SupabaseService redirigido a PostgreSQL Dokploy.');
  }

  getClient() {
    return this.databaseService.getClient();
  }

  from(tableName: string) {
    return this.databaseService.from(tableName);
  }

  // SQL raw con parámetros, para JOINs que no soporta el QueryBuilder
  async query(text: string, params?: any[]) {
    return this.databaseService.query(text, params);
  }
}
