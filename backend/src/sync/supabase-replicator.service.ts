import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseReplicatorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SupabaseReplicatorService.name);
  private supabase: SupabaseClient | null = null;
  private timer: NodeJS.Timeout | null = null;
  private isSyncing = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {
    const supabaseUrl =
      this.config.get<string>('SUPABASE_URL') ||
      process.env.SUPABASE_URL ||
      'https://xygarchwyrflpzywcpid.supabase.co';

    const supabaseKey =
      this.config.get<string>('SUPABASE_KEY') ||
      process.env.SUPABASE_KEY ||
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5Z2FyY2h3eXJmbHB6eXdjcGlkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzE3MzU5NywiZXhwIjoyMDg4NzQ5NTk3fQ.NhK0bVSyLcWAP8EXU35agSs89DCq2LBhRTXv2_P-Y0A';

    if (supabaseUrl && supabaseKey) {
      this.supabase = createClient(supabaseUrl, supabaseKey);
    }
  }

  onModuleInit() {
    if (!this.supabase) {
      this.logger.warn('Supabase no configurado, replicador inactivo.');
      return;
    }

    this.logger.log('🚀 Iniciando Replicador Continuo Supabase -> PostgreSQL Dokploy (cada 25 segundos)');
    
    // Primera sincronización a los 5 segundos de iniciar el backend
    setTimeout(() => this.replicateLatest(), 5000);

    // Bucle continuo cada 25 segundos
    this.timer = setInterval(() => this.replicateLatest(), 25000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async replicateLatest() {
    if (this.isSyncing || !this.supabase) return;
    this.isSyncing = true;

    try {
      const pool = this.db.getPool();

      // 1. Sincronizar últimas interacciones
      const { data: interacciones, error: errInt } = await this.supabase
        .from('cobranza_interacciones')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(60);

      if (!errInt && interacciones && interacciones.length > 0) {
        for (const row of interacciones) {
          const q = `
            INSERT INTO cobranza_interacciones (
              id, socio_id, prestamo_id, gestor_id, fecha_gestion, tipo_contacto,
              resultado, descripcion, latitud, longitud, evidencia_url, sujeto_tipo,
              created_at, num_cuenta, fecha_inicio_gestion
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            ON CONFLICT (id) DO UPDATE SET
              resultado = EXCLUDED.resultado,
              descripcion = EXCLUDED.descripcion,
              latitud = EXCLUDED.latitud,
              longitud = EXCLUDED.longitud,
              evidencia_url = EXCLUDED.evidencia_url,
              sujeto_tipo = EXCLUDED.sujeto_tipo,
              num_cuenta = EXCLUDED.num_cuenta;
          `;
          await pool.query(q, [
            row.id,
            row.socio_id,
            row.prestamo_id,
            row.gestor_id,
            row.fecha_gestion,
            row.tipo_contacto,
            row.resultado,
            row.descripcion,
            row.latitud,
            row.longitud,
            row.evidencia_url,
            row.sujeto_tipo,
            row.created_at || row.fecha_gestion,
            row.num_cuenta,
            row.fecha_inicio_gestion,
          ]);
        }
      }

      // 2. Sincronizar últimas promesas
      const { data: promesas, error: errProm } = await this.supabase
        .from('cobranza_promesas')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);

      if (!errProm && promesas && promesas.length > 0) {
        for (const p of promesas) {
          const qP = `
            INSERT INTO cobranza_promesas (
              id, interaccion_id, monto_prometido, fecha_promesa, estado,
              created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (id) DO UPDATE SET
              estado = EXCLUDED.estado,
              monto_prometido = EXCLUDED.monto_prometido,
              updated_at = EXCLUDED.updated_at;
          `;
          await pool.query(qP, [
            p.id,
            p.interaccion_id,
            p.monto_prometido,
            p.fecha_promesa,
            p.estado,
            p.created_at,
            p.updated_at || p.created_at,
          ]);
        }
      }

      // 3. Sincronizar ubicaciones GPS recientes
      const { data: locs, error: errLoc } = await this.supabase
        .from('ubicaciones_gestores')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(30);

      if (!errLoc && locs && locs.length > 0) {
        for (const loc of locs) {
          const qL = `
            INSERT INTO ubicaciones_gestores (id, gestor_id, latitud, longitud, timestamp)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (id) DO NOTHING;
          `;
          await pool.query(qL, [
            loc.id,
            loc.gestor_id,
            loc.latitud,
            loc.longitud,
            loc.timestamp,
          ]);
        }
      }
    } catch (e: any) {
      this.logger.error(`Error en ciclo de replicación continua: ${e.message}`);
    } finally {
      this.isSyncing = false;
    }
  }
}
