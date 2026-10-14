import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseReplicatorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SupabaseReplicatorService.name);
  private supabase: SupabaseClient | null = null;
  private timer: NodeJS.Timeout | null = null;
  private repairTimer: NodeJS.Timeout | null = null;
  private isSyncing = false;
  private isRepairing = false;

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

    // Auto-reparador continuo de avales según situación y pagos del socio
    // Primer escaneo a los 12 segundos, luego cada 5 minutos
    setTimeout(() => this.autoRepairAvalesStatus(), 12000);
    this.repairTimer = setInterval(() => this.autoRepairAvalesStatus(), 5 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
    if (this.repairTimer) {
      clearInterval(this.repairTimer);
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

      let detectoNuevoPago = false;

      if (!errInt && interacciones && interacciones.length > 0) {
        for (const row of interacciones) {
          if (row.resultado === 'ya_pago') {
            detectoNuevoPago = true;
          }

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

      // Si detectó un 'ya_pago' entrante, disparar auto-reparación inmediata
      if (detectoNuevoPago) {
        this.logger.log('💳 Nuevo reporte "ya_pago" detectado. Ejecutando auto-reparación inmediata...');
        this.autoRepairAvalesStatus().catch(e => {
          this.logger.error(`Error en autoRepairAvalesStatus post-pago: ${e.message}`);
        });
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

  /**
   * Auto-reparación y sincronización de estatus de avales según situación del crédito y pagos
   * 1. Verifica en Dokploy PostgreSQL qué cuentas ya pagaron, tienen mora 0 o saldo 0.
   * 2. Ajusta en Dokploy y en Supabase Cloud:
   *    - Cuentas sin mora o pagadas -> 'AL CORRIENTE - <GESTOR>' (no visible en app móvil)
   *    - Cuentas con mora activa real -> '<GESTOR>' (visible en app móvil)
   */
  public async autoRepairAvalesStatus() {
    if (this.isRepairing || !this.supabase) return;
    this.isRepairing = true;

    try {
      const pool = this.db.getPool();

      // A. Identificar en Dokploy avales que deben ser resguardados
      // (Titular sin crédito, con mora <= 0, con saldo <= 0, liquidado, o con gestión 'ya_pago' este mes)
      const resguardoQuery = `
        WITH cuentas_al_corriente AS (
          SELECT "NoCUENTA" FROM asignacion_gestores
          WHERE COALESCE("DIAS MORA", 0) <= 0 
             OR COALESCE("SALDO AL DIA", 0) <= 0
             OR "SITUACIÓN DEL CRÉDITO" IN ('AL CORRIENTE', 'LIQUIDADO')
             OR "GESTOR ASIGNADO" ILIKE 'AL CORRIENTE - %'
          UNION
          SELECT num_cuenta FROM cobranza_interacciones
          WHERE resultado = 'ya_pago' 
            AND fecha_gestion >= date_trunc('month', CURRENT_DATE)
            AND num_cuenta IS NOT NULL
        )
        UPDATE asignacion_avales
        SET gestor_asignado = 'AL CORRIENTE - ' || TRIM(REGEXP_REPLACE(gestor_asignado, '^AL CORRIENTE - ', '', 'i'))
        WHERE (
          num_cuenta IN (SELECT "NoCUENTA" FROM cuentas_al_corriente)
          OR num_cuenta NOT IN (SELECT "NoCUENTA" FROM asignacion_gestores)
        )
        AND gestor_asignado NOT ILIKE 'AL CORRIENTE - %'
        RETURNING id, num_cuenta, gestor_asignado;
      `;

      const dokResguardados = await pool.query(resguardoQuery);

      // B. Identificar en Dokploy avales que deben reactivarse
      // (Titular con crédito moroso activo, saldo > 0, mora > 0 y sin 'ya_pago' este mes)
      const reactivarQuery = `
        WITH cuentas_mora_activa AS (
          SELECT "NoCUENTA" FROM asignacion_gestores
          WHERE COALESCE("DIAS MORA", 0) > 0 
            AND COALESCE("SALDO AL DIA", 0) > 0
            AND "SITUACIÓN DEL CRÉDITO" NOT IN ('AL CORRIENTE', 'LIQUIDADO')
            AND "GESTOR ASIGNADO" NOT ILIKE 'AL CORRIENTE - %'
            AND "NoCUENTA" NOT IN (
              SELECT num_cuenta FROM cobranza_interacciones
              WHERE resultado = 'ya_pago' 
                AND fecha_gestion >= date_trunc('month', CURRENT_DATE)
                AND num_cuenta IS NOT NULL
            )
        )
        UPDATE asignacion_avales
        SET gestor_asignado = TRIM(REGEXP_REPLACE(gestor_asignado, '^AL CORRIENTE - ', '', 'i'))
        WHERE num_cuenta IN (SELECT "NoCUENTA" FROM cuentas_mora_activa)
        AND gestor_asignado ILIKE 'AL CORRIENTE - %'
        RETURNING id, num_cuenta, gestor_asignado;
      `;

      const dokReactivados = await pool.query(reactivarQuery);

      const totalModificadosDokploy = (dokResguardados.rowCount || 0) + (dokReactivados.rowCount || 0);

      // Si hubo cambios en Dokploy, replicarlos inmediatamente a Supabase Cloud
      if (dokResguardados.rows.length > 0) {
        for (const row of dokResguardados.rows) {
          await this.supabase
            .from('asignacion_avales')
            .update({ gestor_asignado: row.gestor_asignado })
            .eq('id', row.id);
        }
      }

      if (dokReactivados.rows.length > 0) {
        for (const row of dokReactivados.rows) {
          await this.supabase
            .from('asignacion_avales')
            .update({ gestor_asignado: row.gestor_asignado })
            .eq('id', row.id);
        }
      }

      // C. Verificación de seguridad en Supabase Cloud
      // Buscar si en Supabase Cloud existe algún aval con mora 0 que siga visible
      const { data: supaLimpios, error: supaErr } = await this.supabase
        .from('asignacion_avales')
        .select('id, num_cuenta, gestor_asignado')
        .not('gestor_asignado', 'ilike', 'AL CORRIENTE - %')
        .limit(200);

      let supaReparados = 0;
      if (!supaErr && supaLimpios && supaLimpios.length > 0) {
        // Consultar cuáles de estas cuentas no deberían estar visibles
        const cuentasToCheck = supaLimpios.map(s => s.num_cuenta).filter(Boolean);
        if (cuentasToCheck.length > 0) {
          const checkRes = await pool.query(`
            SELECT "NoCUENTA" FROM asignacion_gestores
            WHERE "NoCUENTA" = ANY($1::text[])
              AND (
                COALESCE("DIAS MORA", 0) <= 0 
                OR COALESCE("SALDO AL DIA", 0) <= 0 
                OR "SITUACIÓN DEL CRÉDITO" IN ('AL CORRIENTE', 'LIQUIDADO')
                OR "GESTOR ASIGNADO" ILIKE 'AL CORRIENTE - %'
              )
            UNION
            SELECT num_cuenta FROM cobranza_interacciones
            WHERE num_cuenta = ANY($1::text[])
              AND resultado = 'ya_pago'
              AND fecha_gestion >= date_trunc('month', CURRENT_DATE);
          `, [cuentasToCheck]);

          const invalidSet = new Set(checkRes.rows.map(r => r.NoCUENTA || r.num_cuenta));

          for (const s of supaLimpios) {
            if (invalidSet.has(s.num_cuenta)) {
              const nuevo = `AL CORRIENTE - ${s.gestor_asignado.replace(/^AL CORRIENTE - /i, '').trim()}`;
              await this.supabase.from('asignacion_avales').update({ gestor_asignado: nuevo }).eq('id', s.id);
              supaReparados++;
            }
          }
        }
      }

      if (totalModificadosDokploy > 0 || supaReparados > 0) {
        this.logger.log(
          `🛡️ Auto-reparación ejecutada con éxito: Dokploy (Resguardados: ${dokResguardados.rowCount}, Reactivados: ${dokReactivados.rowCount}), Supabase Cloud ajustados: ${supaReparados}`
        );
      }
    } catch (err: any) {
      this.logger.error(`Error en ciclo de auto-reparación de avales: ${err.message}`);
    } finally {
      this.isRepairing = false;
    }
  }
}
