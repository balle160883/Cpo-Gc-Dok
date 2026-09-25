import { Controller, Post, Body, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

interface QueryFilter {
  column: string;
  op: string;
  value: any;
}

interface QueryPayload {
  table: string;
  operation?: 'select' | 'insert' | 'update' | 'upsert' | 'delete';
  select?: string;
  filters?: QueryFilter[];
  order?: { column: string; ascending?: boolean };
  limit?: number;
  range?: { from: number; to: number };
  payload?: any;
}

@Controller('mobile')
export class MobileController {
  private readonly logger = new Logger(MobileController.name);

  constructor(private readonly db: DatabaseService) {}

  @Post('query')
  async executeQuery(@Body() body: QueryPayload) {
    try {
      const { table, operation = 'select', select = '*', filters = [], order, limit, range, payload } = body;
      
      const builder = this.db.from(table);

      if (filters && Array.isArray(filters)) {
        for (const f of filters) {
          switch (f.op) {
            case 'eq':
              builder.eq(f.column, f.value);
              break;
            case 'neq':
              builder.neq(f.column, f.value);
              break;
            case 'gt':
              builder.gt(f.column, f.value);
              break;
            case 'gte':
              builder.gte(f.column, f.value);
              break;
            case 'lt':
              builder.lt(f.column, f.value);
              break;
            case 'lte':
              builder.lte(f.column, f.value);
              break;
            case 'ilike':
              builder.ilike(f.column, f.value);
              break;
            case 'in':
              builder.in(f.column, f.value);
              break;
            case 'is':
              builder.is(f.column, f.value);
              break;
            case 'or':
              builder.or(f.value);
              break;
          }
        }
      }

      if (order) {
        builder.order(order.column, { ascending: order.ascending });
      }

      if (limit) {
        builder.limit(limit);
      }

      if (range) {
        builder.range(range.from, range.to);
      }

      if (operation === 'insert') {
        builder.insert(payload);
      } else if (operation === 'update') {
        builder.update(payload);
      } else if (operation === 'upsert') {
        builder.upsert(payload);
      } else if (operation === 'delete') {
        builder.delete();
      } else {
        builder.select(select);
      }

      const result = await builder.execute();
      return result;
    } catch (err: any) {
      this.logger.error(`Error in mobile query: ${err.message}`);
      return { data: null, error: { message: err.message } };
    }
  }
}
