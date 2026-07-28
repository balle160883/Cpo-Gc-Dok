import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import * as XLSX from 'xlsx';

@Injectable()
export class PortfolioService {
  private readonly logger = new Logger(PortfolioService.name);

  constructor(private supabaseService: SupabaseService) {}

  async getSocios(limit = 50, gestorId?: string) {
    try {
      // Si hay gestorId, cruzamos asignacion_gestores para filtrar por gestor
      if (gestorId) {
        const asigSql = `
          SELECT DISTINCT "NoSOCIO"
          FROM asignacion_gestores
          WHERE "GESTOR ASIGNADO" = $1
            AND COALESCE(UPPER("SITUACIÓN DEL CRÉDITO"), '') NOT IN ('LIQUIDADO', 'LIQUIDADA', 'PAGADO', 'PAGADA', 'CANCELADO')
            AND (COALESCE("SALDO AL DIA", 0) > 0 OR COALESCE("CAPITAL MOROSO", 0) > 0 OR COALESCE("SALDO TOTAL", 0) > 0)
        `;
        const asigRes = await this.supabaseService.query(asigSql, [gestorId]);
        const sociosIds = [...new Set((asigRes.rows || []).map((a: any) => a.NoSOCIO))].filter(Boolean);
        if (sociosIds.length === 0) return [];

        // La columna correcta en socios_datos es 'friendly_code', no 'numero_socio'
        const { data, error } = await this.supabaseService
          .getClient()
          .from('socios_datos')
          .select('*')
          .in('friendly_code', sociosIds)
          .limit(limit);

        if (error) {
          this.logger.error(`Error fetching socios con gestorId: ${error.message}`);
          throw error;
        }
        return data || [];
      }

      // Sin filtro de gestor: devolver todos con l\u00edmite
      const { data, error } = await this.supabaseService
        .getClient()
        .from('socios_datos')
        .select('*')
        .limit(limit);

      if (error) {
        this.logger.error(`Error fetching socios: ${error.message}`);
        throw error;
      }
      return data || [];
    } catch (e: any) {
      this.logger.error(`Fatal error in getSocios: ${e.message}`);
      return [];
    }
  }

  async getPrestamosPorSocio(socioId: number, gestorId?: string) {
    // Si hay gestorId, validar que el socio le pertenezca
    if (gestorId) {
       const { count } = await this.supabaseService
         .getClient()
         .from('asignacion_gestores')
         .select('*', { count: 'exact', head: true })
         .eq('NoSOCIO', socioId)
         .eq('GESTOR ASIGNADO', gestorId);
       
       if (count === 0) return [];
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('prestamos_datos')
      .select('*')
      .eq('socio_id', socioId);

    if (error) {
      this.logger.error(`Error fetching prestamos: ${error.message}`);
      throw error;
    }
    return data;
  }

  async getCarteraVencida(gestorId?: string) {
    try {
      const params: any[] = [];
      let whereExtra = '';

      if (gestorId) {
        // Obtener cuentas asignadas al gestor
        const { data: asignaciones } = await this.supabaseService
          .getClient()
          .from('asignacion_gestores')
          .select('NoCUENTA')
          .eq('GESTOR ASIGNADO', gestorId);

        const cuentas = (asignaciones || []).map(a => a.NoCUENTA).filter(Boolean);
        if (cuentas.length === 0) return [];

        // Parametrizar lista de cuentas
        const placeholders = cuentas.map((_, i) => `$${i + 2}`).join(', ');
        whereExtra = `AND pd.num_cuenta IN (${placeholders})`;
        params.push(...cuentas);
      }

      // SQL raw con LEFT JOIN a socios_datos para obtener nombre
      // El primer parámetro es el límite
      const limitParam = `$1`;
      params.unshift(200);

      const sql = `
        SELECT pd.*,
               sd.nombre_completo,
               sd.friendly_code
        FROM prestamos_datos pd
        LEFT JOIN socios_datos sd ON pd.socio_id::text = sd.socio_id::text
        WHERE pd.saldo_mora > 0
        ${whereExtra}
        ORDER BY pd.saldo_mora DESC
        LIMIT ${limitParam}
      `;

      const result = await this.supabaseService.query(sql, params);
      return result.rows || [];
    } catch (e: any) {
      this.logger.error(`Error fetching cartera vencida: ${e.message}`);
      return [];
    }
  }

  async getAsignaciones(limit = 1000, gestorId?: string) {
    try {
      const params: any[] = [];
      const whereClauses: string[] = [];

      if (gestorId) {
        params.push(gestorId);
        whereClauses.push(`ag."GESTOR ASIGNADO" = $${params.length}`);
      }

      // 1. Excluir créditos liquidados, pagados o cancelados en asignacion_gestores
      whereClauses.push(`COALESCE(UPPER(ag."SITUACIÓN DEL CRÉDITO"), '') NOT IN ('LIQUIDADO', 'LIQUIDADA', 'PAGADO', 'PAGADA', 'CANCELADO')`);
      
      // 2. Excluir cuentas que ya no tengan saldo moroso ni saldo al día ni saldo total
      whereClauses.push(`(COALESCE(ag."SALDO AL DIA", 0) > 0 OR COALESCE(ag."CAPITAL MOROSO", 0) > 0 OR COALESCE(ag."SALDO TOTAL", 0) > 0)`);

      // 3. Excluir si en la tabla prestamos_datos el crédito ya figura como LIQUIDADO/PAGADO o sin mora/saldo
      whereClauses.push(`NOT EXISTS (
        SELECT 1 FROM prestamos_datos pd
        WHERE (pd.num_cuenta = ag."NoCUENTA" OR pd.socio_id::text = ag."NoSOCIO")
          AND (
            COALESCE(UPPER(pd.estado), '') IN ('LIQUIDADO', 'LIQUIDADA', 'PAGADO', 'PAGADA', 'CANCELADO')
            OR (COALESCE(pd.saldo_mora, 0) <= 0 AND COALESCE(pd.saldo_total, 0) <= 0)
          )
      )`);

      // 4. Excluir si existe un registro de pago en pagos_recuperados que liquida o cubre el abono
      whereClauses.push(`NOT EXISTS (
        SELECT 1 FROM pagos_recuperados pr
        WHERE (pr.num_credito = ag."NoCUENTA" OR pr.numero_socio = ag."NoSOCIO")
          AND (
            COALESCE(UPPER(pr.descripcion), '') LIKE '%LIQUID%'
            OR COALESCE(UPPER(pr.descripcion), '') LIKE '%PAGO TOTAL%'
            OR COALESCE(pr.abono_total, 0) >= COALESCE(ag."SALDO TOTAL", ag."SALDO AL DIA", 1)
          )
      )`);

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
      
      const numLimit = Number(limit);
      const effectiveLimit = gestorId ? Math.max(isNaN(numLimit) ? 1000 : numLimit, 1000) : (isNaN(numLimit) ? 1000 : numLimit);
      params.push(effectiveLimit);

      const sql = `
        SELECT ag.*
        FROM asignacion_gestores ag
        ${whereSql}
        ORDER BY ag."FECHA ASIGNACION" DESC
        LIMIT $${params.length}
      `;

      const result = await this.supabaseService.query(sql, params);
      return result.rows || [];
    } catch (error: any) {
      this.logger.error(`Error fetching asignaciones: ${error.message}`);
      throw error;
    }
  }

  async getAvales(limit = 1000, gestorId?: string) {
    let query = this.supabaseService
      .getClient()
      .from('asignacion_avales')
      .select('*');

    if (gestorId) {
      query = query.eq('gestor_asignado', gestorId);
    }

    const numLimit = Number(limit);
    const effectiveLimit = gestorId ? Math.max(isNaN(numLimit) ? 1000 : numLimit, 1000) : (isNaN(numLimit) ? 1000 : numLimit);
    query = query.limit(effectiveLimit);

    const { data, error } = await query;

    if (error) {
      this.logger.error(`Error fetching avales: ${error.message}`);
      return [];
    }
    return data || [];
  }

  private _toUTCStartOfDay(dateStr: string): string {
    if (!dateStr) return dateStr;
    const match = dateStr.match(/^\d{4}-\d{2}-\d{2}$/);
    if (match) {
      return `${dateStr}T06:00:00.000Z`;
    }
    return dateStr;
  }

  private _toUTCEndOfDay(dateStr: string): string {
    if (!dateStr) return dateStr;
    const match = dateStr.match(/^\d{4}-\d{2}-\d{2}$/);
    if (match) {
      const date = new Date(`${dateStr}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + 1);
      const nextDayStr = date.toISOString().split('T')[0];
      return `${nextDayStr}T05:59:59.999Z`;
    }
    return dateStr;
  }

  async getRecuperacion(gestorId?: string, startDate?: string, endDate?: string) {
    const recoveryDocs: any[] = [];

    try {
      // =================================================================
      // 1. Pagos reales desde pagos_recuperados
      //    NOTA: gestor_asignado es NULL en estos registros.
      //    Cruzamos con asignacion_gestores por num_credito para saber el gestor.
      // =================================================================
      const pagosParams: any[] = [];
      let pagosWhere: string[] = [];

      if (startDate) {
        pagosParams.push(this._toUTCStartOfDay(startDate));
        pagosWhere.push(`pr.fecha_real >= $${pagosParams.length}`);
      }
      if (endDate) {
        pagosParams.push(this._toUTCEndOfDay(endDate));
        pagosWhere.push(`pr.fecha_real <= $${pagosParams.length}`);
      }
      if (gestorId) {
        pagosParams.push(gestorId);
        pagosWhere.push(`ag."GESTOR ASIGNADO" = $${pagosParams.length}`);
      }

      pagosParams.push(500);
      const pagosWhereStr = pagosWhere.length > 0 ? `WHERE ${pagosWhere.join(' AND ')}` : '';

      const pagosSQL = `
        SELECT pr.id, pr.num_credito, pr.nombre, pr.numero_socio,
               pr.abono_total, pr.abono_capital, pr.fecha_real, pr.created_at,
               ag."GESTOR ASIGNADO" as gestor_asignado
        FROM pagos_recuperados pr
        LEFT JOIN asignacion_gestores ag ON pr.num_credito = ag."NoCUENTA"
        ${pagosWhereStr}
        ORDER BY pr.fecha_real DESC
        LIMIT $${pagosParams.length}
      `;

      const pagosResult = await this.supabaseService.query(pagosSQL, pagosParams);
      (pagosResult.rows || []).forEach((item: any) => {
        recoveryDocs.push({
          id: item.id,
          abono_total: Number(item.abono_total) || 0,
          nombre: item.nombre,
          numero_socio: item.numero_socio,
          num_credito: item.num_credito,
          fecha_real: item.fecha_real || item.created_at,
          gestor: item.gestor_asignado || 'Sistema',
          tipo: 'PAGO_REAL'
        });
      });

      // =================================================================
      // 2. Cartera activa con capital moroso desde asignacion_gestores
      // =================================================================
      let queryActivos = this.supabaseService
        .getClient()
        .from('asignacion_gestores')
        .select('"GESTOR ASIGNADO", "CAPITAL MOROSO", NoSOCIO, NOMBRE, NoCUENTA, "FECHA ASIGNACION", "SITUACIÓN DEL CRÉDITO"');

      if (gestorId) queryActivos = queryActivos.eq('GESTOR ASIGNADO', gestorId);
      if (startDate) queryActivos = queryActivos.gte('FECHA ASIGNACION', startDate);
      if (endDate) queryActivos = queryActivos.lte('FECHA ASIGNACION', endDate);

      const { data: activos, error: errorActivos } = await queryActivos.limit(200);
      if (errorActivos) {
        this.logger.error(`Error fetching asignacion_gestores for recovery: ${errorActivos.message}`);
      } else if (activos) {
        activos.forEach(item => {
          const capitalMoroso = Number(item['CAPITAL MOROSO']) || 0;
          if (capitalMoroso > 0 || item['SITUACIÓN DEL CRÉDITO'] === 'LIQUIDADO') {
            recoveryDocs.push({
              abono_total: capitalMoroso,
              nombre: item.NOMBRE,
              numero_socio: item.NoSOCIO,
              num_credito: item.NoCUENTA,
              fecha_real: item['FECHA ASIGNACION'],
              gestor: item['GESTOR ASIGNADO'],
              tipo: 'CARTERA_ACTIVA'
            });
          }
        });
      }

      recoveryDocs.sort((a, b) => {
        const dateA = new Date(a.fecha_real || 0).getTime();
        const dateB = new Date(b.fecha_real || 0).getTime();
        return dateB - dateA;
      });

    } catch (err) {
      this.logger.error(`Fatal error in getRecuperacion: ${err.message}`);
    }

    return recoveryDocs;
  }

  async getAllGestoresLocations() {
    try {
      const sql = `
        SELECT ug_loc.id,
               ug_loc.gestor_id,
               ug_loc.latitud,
               ug_loc.longitud,
               ug_loc.timestamp,
               ug.gestor AS gestor_name
        FROM ubicaciones_gestores ug_loc
        LEFT JOIN usuarios_gestor ug ON ug.id::text = ug_loc.gestor_id::text
        ORDER BY ug_loc.timestamp DESC
        LIMIT 500
      `;

      const result = await this.supabaseService.query(sql);
      const rows = result.rows || [];

      // Filtrar para obtener solo la última ubicación de cada gestor
      const uniqueLocations = new Map();
      rows.forEach(loc => {
        if (!uniqueLocations.has(loc.gestor_id)) {
          uniqueLocations.set(loc.gestor_id, {
            id: loc.id,
            gestor_id: loc.gestor_id,
            latitud: Number(loc.latitud),
            longitud: Number(loc.longitud),
            timestamp: loc.timestamp,
            gestor_name: loc.gestor_name || 'Gestor'
          });
        }
      });

      return Array.from(uniqueLocations.values());
    } catch (error: any) {
      this.logger.error(`Error fetching gestores locations: ${error.message}`);
      return [];
    }
  }

  async saveGestorLocation(gestorId: string, latitud: number, longitud: number) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('ubicaciones_gestores')
      .insert({
        gestor_id: gestorId,
        latitud,
        longitud,
        timestamp: new Date().toISOString(),
      });

    if (error) {
      this.logger.error(`Error saving gestor location: ${error.message}`);
      throw error;
    }
    return { success: true };
  }


  async getAllGestores() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('usuarios_gestor')
      .select('id, gestor')
      .order('gestor', { ascending: true });

    if (error) {
      this.logger.error(`Error fetching all gestores: ${error.message}`);
      throw error;
    }

    return data.map(g => ({
      gestor_id: g.id,
      gestor_name: g.gestor
    }));
  }

  async updateAsignacion(noCuenta: string, data: any) {
    const payload: any = { ...data };

    // Si la app móvil envía 'situacion', mapearla a la columna real de BD 'SITUACIÓN DEL CRÉDITO'
    if (payload.situacion !== undefined) {
      payload['SITUACIÓN DEL CRÉDITO'] = payload.situacion;
      delete payload.situacion;
    }

    const { data: result, error } = await this.supabaseService
      .getClient()
      .from('asignacion_gestores')
      .update(payload)
      .eq('NoCUENTA', noCuenta)
      .select();

    if (error) {
      this.logger.error(`Error updating asignacion ${noCuenta}: ${error.message}`);
      throw error;
    }
    return result;
  }

  async importAvales(fileBuffer: Buffer) {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet) as any[];

    if (data.length === 0) return { success: false, message: 'El archivo está vacío' };

    // 1. Obtener gestores de BD para mapeo
    const { data: dbGestoresData } = await this.supabaseService.getClient().from('usuarios_gestor').select('gestor');
    const dbGestores = dbGestoresData || [];

    const clean = (str: string): string => {
      if (!str) return '';
      return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
    };

    const cols = Object.keys(data[0]);

    // Buscar las columnas clave usando una lógica más flexible
    const gestorCol = cols.find(c => {
      const norm = c.toUpperCase().replace(/[\s_.-]/g, '');
      return norm.includes('GESTOR') || norm.includes('USUARIO');
    });

    const hasCuentaCol = cols.some(c => {
      const norm = c.toUpperCase().replace(/[\s_.-]/g, '');
      return norm === 'NOCUENTA' || norm === 'NUMCUENTA' || norm === 'CUENTA';
    });

    const hasAvalCol = cols.some(c => {
      const norm = c.toUpperCase().replace(/[\s_.-]/g, '');
      return norm === 'NOMBREAVAL' || norm === 'AVAL' || norm.includes('NOMBREAVAL');
    });

    // Validar columnas requeridas antes de realizar cualquier cambio en la base de datos
    if (!gestorCol) {
      return {
        success: false,
        message: 'No se encontró la columna del gestor (debe contener "GESTOR" o "USUARIO" en el encabezado)'
      };
    }
    if (!hasCuentaCol) {
      return {
        success: false,
        message: 'No se encontró la columna de la cuenta (debe ser "NoCUENTA", "NumCuenta" o similar)'
      };
    }
    if (!hasAvalCol) {
      return {
        success: false,
        message: 'No se encontró la columna del aval (debe ser "NOMBRE AVAL", "AVAL" o similar)'
      };
    }

    // Helper para obtener el valor del renglón de manera insensible a mayúsculas/minúsculas y caracteres especiales
    const getValueCaseInsensitive = (row: any, ...aliases: string[]): string => {
      const keys = Object.keys(row);
      const cleanAliases = aliases.map(a => a.toUpperCase().replace(/[\s_.-]/g, ''));
      const foundKey = keys.find(k => {
        const cleanKey = k.toUpperCase().replace(/[\s_.-]/g, '');
        return cleanAliases.includes(cleanKey);
      });
      return foundKey ? String(row[foundKey] || '').trim() : '';
    };

    const findGestorMatch = (excelName: string): string | null => {
      const cleanExcel = clean(excelName);
      if (!cleanExcel) return null;

      // 1. Coincidencia exacta
      const exactMatch = dbGestores.find(dbg => clean(dbg.gestor) === cleanExcel);
      if (exactMatch) return exactMatch.gestor;

      // 2. Coincidencia por palabras (descartando preposiciones cortas)
      const excelWords = cleanExcel.split(/\s+/).filter(w => w.length > 2);
      if (excelWords.length === 0) return null;

      for (const dbg of dbGestores) {
        const cleanDb = clean(dbg.gestor);
        const dbWords = cleanDb.split(/\s+/).filter(w => w.length > 2);
        if (dbWords.length === 0) continue;

        const allExcelInDb = excelWords.every(w => dbWords.includes(w));
        const allDbInExcel = dbWords.every(w => excelWords.includes(w));
        if (allExcelInDb || allDbInExcel) {
          return dbg.gestor;
        }
      }

      return null;
    };

    const assignments: any[] = [];
    const unmatchedGestores = new Set<string>();
    const cuentaCount = new Map<string, number>();

    for (const row of data) {
      const excelName = String(row[gestorCol] || '').trim();
      if (!excelName) continue; // Si no hay nombre de gestor, ignorar o no asociar

      const gestorMatch = findGestorMatch(excelName);

      if (gestorMatch) {
        const numCuenta = getValueCaseInsensitive(row, 'NoCUENTA', 'num_cuenta', 'cuenta', 'numcuenta');
        const count = cuentaCount.get(numCuenta) || 0;
        cuentaCount.set(numCuenta, count + 1);
        const tipoAval = count === 0 ? 'Aval 1' : 'Aval 2';

        assignments.push({
          num_cuenta: numCuenta,
          nombre_aval: getValueCaseInsensitive(row, 'NOMBREAVAL', 'nombre_aval', 'aval'),
          domicilio_aval: getValueCaseInsensitive(row, 'DOMICILIO', 'domicilio_aval', 'domicilio'),
          colonia_aval: getValueCaseInsensitive(row, 'COLONIA', 'colonia_aval', 'colonia'),
          municipio_aval: getValueCaseInsensitive(row, 'MUNICIPIO', 'municipio_aval', 'municipio'),
          cp_aval: getValueCaseInsensitive(row, 'CP', 'cp_aval', 'codigo_postal', 'codigopostal'),
          cruces_aval: getValueCaseInsensitive(row, 'CRUCES', 'cruces_aval', 'cruce'),
          estado_aval: getValueCaseInsensitive(row, 'ESTADO', 'estado_aval', 'estado') || 'JALISCO',
          telefono_aval: getValueCaseInsensitive(row, 'TELEFONOS', 'telefono', 'tel', 'telefono_aval', 'celular'),
          gestor_asignado: gestorMatch,
          tipo_aval: tipoAval
        });
      } else {
        unmatchedGestores.add(excelName);
      }
    }

    // Si no obtuvimos ningún registro válido que insertar, retornamos con un error y NO borramos los datos actuales
    if (assignments.length === 0) {
      return {
        success: false,
        message: 'No se encontraron registros válidos o asociables a gestores existentes en el archivo.',
        gestoresNoEncontrados: Array.from(unmatchedGestores)
      };
    }

    this.logger.log(`Limpiando tabla asignacion_avales e importando ${assignments.length} registros...`);
    // Borrar de forma segura ahora que sabemos que tenemos datos listos para insertar
    await this.supabaseService.getClient().from('asignacion_avales').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // Insertar en lotes
    const batchSize = 100;
    let insertedCount = 0;
    for (let i = 0; i < assignments.length; i += batchSize) {
      const batch = assignments.slice(i, i + batchSize);
      const { error } = await this.supabaseService.getClient().from('asignacion_avales').insert(batch);
      if (error) {
        this.logger.error(`Error en lote ${i}: ${error.message}`);
      } else {
        insertedCount += batch.length;
      }
    }

    return {
      success: true,
      totalProcesados: data.length,
      insertados: insertedCount,
      gestoresNoEncontrados: Array.from(unmatchedGestores)
    };
  }
}
