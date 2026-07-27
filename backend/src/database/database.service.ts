import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

export class QueryBuilder {
  private tableName: string;
  private selectedCols: string = '*';
  private whereClauses: string[] = [];
  private queryParams: any[] = [];
  private orderClause: string = '';
  private limitVal?: number;
  private offsetVal?: number;
  private countMode?: boolean;
  private headMode?: boolean;
  private operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'UPSERT' = 'SELECT';
  private payload: any = null;
  private pool: Pool;

  constructor(tableName: string, pool: Pool) {
    this.tableName = tableName;
    this.pool = pool;
  }

  select(cols: string = '*', options?: { count?: string; head?: boolean }) {
    this.selectedCols = cols || '*';
    if (options?.count) {
      this.countMode = true;
    }
    if (options?.head) {
      this.headMode = true;
    }
    return this;
  }

  eq(column: string, value: any) {
    if (value !== undefined) {
      if (value === null) {
        this.whereClauses.push(`"${column}" IS NULL`);
      } else {
        this.queryParams.push(value);
        this.whereClauses.push(`"${column}" = $${this.queryParams.length}`);
      }
    }
    return this;
  }

  neq(column: string, value: any) {
    if (value !== undefined) {
      if (value === null) {
        this.whereClauses.push(`"${column}" IS NOT NULL`);
      } else {
        this.queryParams.push(value);
        this.whereClauses.push(`"${column}" != $${this.queryParams.length}`);
      }
    }
    return this;
  }

  is(column: string, value: any) {
    if (value === null || value === undefined) {
      this.whereClauses.push(`"${column}" IS NULL`);
    } else {
      this.queryParams.push(value);
      this.whereClauses.push(`"${column}" = $${this.queryParams.length}`);
    }
    return this;
  }

  gt(column: string, value: any) {
    if (value !== undefined) {
      this.queryParams.push(value);
      this.whereClauses.push(`"${column}" > $${this.queryParams.length}`);
    }
    return this;
  }

  gte(column: string, value: any) {
    if (value !== undefined) {
      this.queryParams.push(value);
      this.whereClauses.push(`"${column}" >= $${this.queryParams.length}`);
    }
    return this;
  }

  lt(column: string, value: any) {
    if (value !== undefined) {
      this.queryParams.push(value);
      this.whereClauses.push(`"${column}" < $${this.queryParams.length}`);
    }
    return this;
  }

  lte(column: string, value: any) {
    if (value !== undefined) {
      this.queryParams.push(value);
      this.whereClauses.push(`"${column}" <= $${this.queryParams.length}`);
    }
    return this;
  }

  ilike(column: string, pattern: string) {
    if (pattern !== undefined) {
      this.queryParams.push(pattern);
      this.whereClauses.push(`"${column}" ILIKE $${this.queryParams.length}`);
    }
    return this;
  }

  in(column: string, values: any[]) {
    if (values && values.length > 0) {
      const placeholders = values.map(v => {
        this.queryParams.push(v);
        return `$${this.queryParams.length}`;
      }).join(', ');
      this.whereClauses.push(`"${column}" IN (${placeholders})`);
    } else {
      this.whereClauses.push('1 = 0');
    }
    return this;
  }

  or(conditionStr: string) {
    if (conditionStr) {
      const parts = conditionStr.split(',');
      const orClauses: string[] = [];
      for (const part of parts) {
        const match = part.match(/^([^.]+)\.([^.]+)\.(.+)$/);
        if (match) {
          const [, col, op, val] = match;
          const cleanVal = val.replace(/^%|%$/g, '');
          this.queryParams.push(op.toLowerCase().includes('like') ? `%${cleanVal}%` : cleanVal);
          const idx = this.queryParams.length;
          const sqlOp = op.toLowerCase() === 'ilike' ? 'ILIKE' : '=';
          orClauses.push(`"${col.trim()}" ${sqlOp} $${idx}`);
        }
      }
      if (orClauses.length > 0) {
        this.whereClauses.push(`(${orClauses.join(' OR ')})`);
      }
    }
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    const dir = options?.ascending === false ? 'DESC' : 'ASC';
    this.orderClause = `ORDER BY "${column}" ${dir}`;
    return this;
  }

  limit(limitVal: number) {
    if (limitVal && limitVal > 0) {
      this.limitVal = limitVal;
    }
    return this;
  }

  range(from: number, to: number) {
    if (from >= 0 && to >= from) {
      this.offsetVal = from;
      this.limitVal = (to - from) + 1;
    }
    return this;
  }

  insert(data: any) {
    this.operation = 'INSERT';
    this.payload = data;
    return this;
  }

  update(data: Record<string, any>) {
    this.operation = 'UPDATE';
    this.payload = data;
    return this;
  }

  delete() {
    this.operation = 'DELETE';
    return this;
  }

  upsert(data: any, options?: { onConflict?: string }) {
    this.operation = 'UPSERT';
    this.payload = { data, onConflict: options?.onConflict || 'id' };
    return this;
  }

  async execute(): Promise<{ data: any; error: any; count?: number }> {
    try {
      const whereSql = this.whereClauses.length > 0 ? `WHERE ${this.whereClauses.join(' AND ')}` : '';

      if (this.operation === 'INSERT') {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
        if (rows.length === 0) return { data: [], error: null };
        const allKeys = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
        const columns = allKeys.map(k => `"${k}"`).join(', ');

        const valueTuples: string[] = [];
        const params: any[] = [];
        let paramIdx = 1;

        for (const row of rows) {
          const tuple: string[] = [];
          for (const key of allKeys) {
            params.push(row[key] !== undefined ? row[key] : null);
            tuple.push(`$${paramIdx++}`);
          }
          valueTuples.push(`(${tuple.join(', ')})`);
        }

        const sql = `INSERT INTO "${this.tableName}" (${columns}) VALUES ${valueTuples.join(', ')} RETURNING *;`;
        const res = await this.pool.query(sql, params);
        return { data: Array.isArray(this.payload) ? res.rows : res.rows[0], error: null };
      }

      if (this.operation === 'UPDATE') {
        const keys = Object.keys(this.payload || {});
        if (keys.length === 0) return { data: [], error: null };

        const setClauses: string[] = [];
        const params = [...this.queryParams];
        let paramIdx = params.length + 1;

        for (const key of keys) {
          params.push(this.payload[key]);
          setClauses.push(`"${key}" = $${paramIdx++}`);
        }

        const sql = `UPDATE "${this.tableName}" SET ${setClauses.join(', ')} ${whereSql} RETURNING *;`;
        const res = await this.pool.query(sql, params);
        return { data: res.rows, error: null };
      }

      if (this.operation === 'DELETE') {
        const sql = `DELETE FROM "${this.tableName}" ${whereSql} RETURNING *;`;
        const res = await this.pool.query(sql, this.queryParams);
        return { data: res.rows, error: null };
      }

      if (this.operation === 'UPSERT') {
        const { data, onConflict } = this.payload;
        const rows = Array.isArray(data) ? data : [data];
        if (rows.length === 0) return { data: [], error: null };
        const allKeys = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
        const columns = allKeys.map(k => `"${k}"`).join(', ');

        const valueTuples: string[] = [];
        const params: any[] = [];
        let paramIdx = 1;

        for (const row of rows) {
          const tuple: string[] = [];
          for (const key of allKeys) {
            params.push(row[key] !== undefined ? row[key] : null);
            tuple.push(`$${paramIdx++}`);
          }
          valueTuples.push(`(${tuple.join(', ')})`);
        }

        const updateSet = allKeys.filter(k => k !== onConflict).map(k => `"${k}" = EXCLUDED."${k}"`).join(', ');
        const conflictClause = updateSet
          ? `ON CONFLICT ("${onConflict}") DO UPDATE SET ${updateSet}`
          : `ON CONFLICT ("${onConflict}") DO NOTHING`;

        const sql = `INSERT INTO "${this.tableName}" (${columns}) VALUES ${valueTuples.join(', ')} ${conflictClause} RETURNING *;`;
        const res = await this.pool.query(sql, params);
        return { data: Array.isArray(data) ? res.rows : res.rows[0], error: null };
      }

      // Default: SELECT
      let countVal: number | undefined = undefined;

      if (this.countMode) {
        const countSql = `SELECT COUNT(*)::int as total FROM "${this.tableName}" ${whereSql};`;
        const countRes = await this.pool.query(countSql, this.queryParams);
        countVal = countRes.rows[0]?.total || 0;
        if (this.headMode) {
          return { data: null, error: null, count: countVal };
        }
      }

      let cols = this.selectedCols;
      if (cols.includes('(') && cols.includes(')')) {
        cols = cols.replace(/,\s*[a-zA-Z0-9_]+\([^)]*\)/g, '').replace(/[a-zA-Z0-9_]+\([^)]*\)/g, '*').trim();
        if (!cols || cols === ',') cols = '*';
      }
      let sql = `SELECT ${cols} FROM "${this.tableName}" ${whereSql} ${this.orderClause}`;
      if (this.limitVal) {
        sql += ` LIMIT ${this.limitVal}`;
      }
      if (this.offsetVal) {
        sql += ` OFFSET ${this.offsetVal}`;
      }

      const res = await this.pool.query(sql, this.queryParams);
      return { data: res.rows, error: null, count: countVal };
    } catch (err: any) {
      return { data: null, error: err };
    }
  }

  // Método thenable para permitir await directamente sobre el builder
  then(resolve: (res: { data: any; error: any; count?: number }) => void, reject?: (err: any) => void) {
    this.execute().then(resolve, reject);
  }
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool;
  private readonly logger = new Logger(DatabaseService.name);

  constructor(private configService: ConfigService) {
    const connectionString =
      this.configService.get<string>('DATABASE_URL') ||
      process.env.DATABASE_URL ||
      'postgresql://postgres:Seguridad2028%40@31.97.144.6:5435/postgres';

    this.pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }

  async onModuleInit() {
    try {
      const client = await this.pool.connect();
      this.logger.log('✅ Conectado exitosamente a la base de datos PostgreSQL en Dokploy.');
      client.release();
    } catch (err: any) {
      this.logger.error(`❌ Error al conectar a PostgreSQL Dokploy: ${err.message}`);
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  getPool(): Pool {
    return this.pool;
  }

  from(tableName: string): QueryBuilder {
    return new QueryBuilder(tableName, this.pool);
  }

  getClient() {
    return {
      from: (tableName: string) => this.from(tableName),
    };
  }

  async query(text: string, params?: any[]) {
    return this.pool.query(text, params);
  }
}
