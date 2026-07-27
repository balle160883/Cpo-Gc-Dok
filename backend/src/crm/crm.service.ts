import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class CrmService {
  private readonly logger = new Logger(CrmService.name);

  constructor(private supabaseService: SupabaseService) {}

  private _getSujetoEfectivo(item: any): string {
    const desc = item.descripcion || "";
    if (desc.startsWith('1-') || desc.startsWith('2-')) return 'Aval';
    if (desc.startsWith('0-')) return 'Socio';
    return item.sujeto_tipo || 'Socio';
  }

  private _normalizeId(id: any): string {
    if (!id) return '';
    let strId = String(id).trim();
    // Eliminar prefijos de sucursal comunes (ej: '10-156930' -> '156930')
    if (strId.includes('-')) {
      strId = strId.split('-').pop() || strId;
    }
    // Eliminar ceros a la izquierda
    return strId.replace(/^0+/, '');
  }

  private _deduplicateInteracciones(items: any[]): any[] {
    if (!items || items.length === 0) return [];
    
    // Sort descending by fecha_gestion
    const sorted = [...items].sort((a, b) => new Date(b.fecha_gestion).getTime() - new Date(a.fecha_gestion).getTime());
    const uniqueData: any[] = [];

    for (const item of sorted) {
      const itemTime = new Date(item.fecha_gestion).getTime();
      const duplicateIdx = uniqueData.findIndex(existing => {
        if (existing.socio_id !== item.socio_id) return false;
        if (existing.gestor_id !== item.gestor_id) return false;
        
        const diffSeconds = Math.abs(new Date(existing.fecha_gestion).getTime() - itemTime) / 1000;
        return diffSeconds <= 120; // 2 minutes window
      });

      if (duplicateIdx !== -1) {
        const existing = uniqueData[duplicateIdx];
        const existingIsGeneric = existing.descripcion === 'Visita cerrada desde detalle sin comentarios';
        const currentIsGeneric = item.descripcion === 'Visita cerrada desde detalle sin comentarios';

        if (existingIsGeneric && !currentIsGeneric) {
          uniqueData[duplicateIdx] = item;
        }
      } else {
        uniqueData.push(item);
      }
    }
    
    return uniqueData;
  }

  private async _mapInteraccionesConAsignacion(uniqueData: any[]): Promise<any[]> {
    if (!uniqueData || uniqueData.length === 0) return [];

    const socioIds = [...new Set(uniqueData.map(i => i.socio_id))].filter(Boolean);
    const prestamoIds = [...new Set(uniqueData.map(i => i.prestamo_id))].filter(Boolean);
    const numCuentas = [...new Set(uniqueData.map(i => i.num_cuenta))].filter(Boolean);

    const numericSocioIds: number[] = [];
    const stringSocioIds: string[] = [];

    socioIds.forEach(id => {
      const num = Number(id);
      if (!isNaN(num)) {
        numericSocioIds.push(num);
      }
      const rawStr = String(id).trim();
      stringSocioIds.push(rawStr);
      const digits = rawStr.replace(/\D/g, '');
      if (digits.length > 0) {
        stringSocioIds.push(digits.padStart(8, '0'));
      }
    });

    const uniqueNumericSocioIds = [...new Set(numericSocioIds)];
    const uniqueStringSocioIds = [...new Set(stringSocioIds)];

    // 1. Fetch socios from socios_datos by their internal socio_id and friendly_code formats in parallel
    const [sociosByNum, sociosByStr] = await Promise.all([
      uniqueNumericSocioIds.length > 0
        ? this._fetchInBatches('socios_datos', 'socio_id', uniqueNumericSocioIds, 'socio_id, friendly_code, nombre_completo')
        : Promise.resolve([]),
      uniqueStringSocioIds.length > 0
        ? this._fetchInBatches('socios_datos', 'friendly_code', uniqueStringSocioIds, 'socio_id, friendly_code, nombre_completo')
        : Promise.resolve([])
    ]);

    const socios = [...sociosByNum, ...sociosByStr];
    
    // 2. Extract friendly codes to query assignments
    const friendlyCodes = [...new Set([
      ...socios.map(s => s.friendly_code),
      ...uniqueStringSocioIds
    ])].filter(Boolean);

    // 3. Fetch assignments (by Socio and by Account) and loans in parallel
    const [avalesBySocio, avalesByCuenta, prestamos] = await Promise.all([
      this._fetchInBatches('asignacion_gestores', 'NoSOCIO', friendlyCodes, 'NoSOCIO, NoCUENTA, NOMBRE, "NOMBRE D.A.1", "NOMBRE D.A.2", "FECHA ASIGNACION"'),
      numCuentas.length > 0
        ? this._fetchInBatches('asignacion_gestores', 'NoCUENTA', numCuentas, 'NoSOCIO, NoCUENTA, NOMBRE, "NOMBRE D.A.1", "NOMBRE D.A.2", "FECHA ASIGNACION"')
        : Promise.resolve([]),
      prestamoIds.length > 0 ? this._fetchInBatches('prestamos_datos', 'prestamo_id', prestamoIds, 'prestamo_id, num_cuenta, socio_id') : Promise.resolve([])
    ]);

    const avales = [...avalesBySocio, ...avalesByCuenta];

    return uniqueData.map(i => {
      const isNum = !isNaN(Number(i.socio_id));
      const iStr = String(i.socio_id).trim();
      const iDigits = iStr.replace(/\D/g, '');
      const iPadded = iDigits.padStart(8, '0');

      const foundSocio = socios.find(s => {
        if (s.socio_id === Number(i.socio_id)) return true;
        return s.friendly_code === iStr || s.friendly_code === iPadded;
      });
      const fCode = foundSocio?.friendly_code || iStr;

      let foundAsig = fCode ? (
        avales.find(a => 
          a.NoSOCIO === fCode &&
          (i.num_cuenta ? a.NoCUENTA === i.num_cuenta : true)
        ) || avales.find(a => a.NoSOCIO === fCode)
      ) : null;

      // Fallback 1: compare base digits (ignoring sucursal prefix and leading zeroes)
      if (!foundAsig && fCode) {
        const cleanFCode = fCode.replace(/\D/g, '').replace(/^0+/, '');
        foundAsig = avales.find(a => {
          const cleanNoSocio = a.NoSOCIO.trim().replace(/\D/g, '').replace(/^0+/, '');
          return cleanNoSocio.length > 0 && cleanNoSocio === cleanFCode && (i.num_cuenta ? a.NoCUENTA === i.num_cuenta : true);
        }) || avales.find(a => {
          const cleanNoSocio = a.NoSOCIO.trim().replace(/\D/g, '').replace(/^0+/, '');
          return cleanNoSocio.length > 0 && cleanNoSocio === cleanFCode;
        }) || null;
      }

      // Fallback 2: if still not found, search by account number (NoCUENTA)
      if (!foundAsig && i.num_cuenta) {
        foundAsig = avales.find(a => a.NoCUENTA === i.num_cuenta) || null;
      }

      // Robust fallback if assignment is missing
      if (!foundAsig && i.prestamo_id) {
        const pMatch = prestamos.find((p: any) => p.prestamo_id === i.prestamo_id);
        if (pMatch) {
          foundAsig = avales.find(a => a.NoCUENTA === pMatch.num_cuenta) || null;
        }
      }

      const sujetoEfectivo = this._getSujetoEfectivo(i);
      const isAval = sujetoEfectivo.startsWith('Aval');
      const socioName = foundSocio?.nombre_completo || foundAsig?.NOMBRE || '';
      
      let avalName = null;
      if (sujetoEfectivo === 'Aval 1') {
        avalName = foundAsig?.['NOMBRE D.A.1'];
      } else if (sujetoEfectivo === 'Aval 2') {
        avalName = foundAsig?.['NOMBRE D.A.2'];
      } else {
        avalName = foundAsig?.['NOMBRE D.A.1'] || foundAsig?.['NOMBRE D.A.2'];
      }

      const tipoGestion = i.tipo_contacto === 'visita' ? 'Visita' :
                          i.tipo_contacto === 'llamada' ? 'Llamada' :
                          (i.tipo_contacto === 'whatsapp' || i.tipo_contacto === 'sms' || i.tipo_contacto === 'mensaje') ? 'Mensaje' :
                          'Visita';

      return {
        ...i,
        tipo_gestion: tipoGestion,
        nombre_visitado: isAval ? (avalName || (socioName ? `Aval de ${socioName}` : null)) : socioName,
        socios_datos: foundSocio ? { friendly_code: foundSocio.friendly_code, nombre_completo: foundSocio.nombre_completo } : null,
        asignacion: foundAsig,
        num_cuenta: i.num_cuenta || foundAsig?.NoCUENTA,
        fecha_inicio_gestion: i.fecha_inicio_gestion || foundAsig?.['FECHA ASIGNACION']
      };
    });
  }

  private async _fetchInBatches(table: string, column: string, ids: any[], selectStr: string = '*'): Promise<any[]> {
    if (!ids || ids.length === 0) return [];
    
    // Eliminar duplicados y nulos/vacÃ­os
    const uniqueIds = [...new Set(ids.map(id => String(id || '').trim()))].filter(id => id.length > 0);
    const BATCH_SIZE = 500;
    let allResults: any[] = [];

    for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
      const batchIds = uniqueIds.slice(i, i + BATCH_SIZE);
      const { data, error } = await this.supabaseService.getClient()
        .from(table)
        .select(selectStr)
        .in(column, batchIds);

      if (error) {
        this.logger.error(`Error in batch lookup for ${table}: ${error.message}`);
        continue;
      }
      if (data) {
        allResults = [...allResults, ...data];
      }
    }

    return allResults;
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

  async registrarInteraccion(interaccion: any) {
    // Map tipo_gestion to tipo_contacto for compatibility with the database schema
    if (interaccion.tipo_gestion) {
      const tg = String(interaccion.tipo_gestion).toLowerCase();
      if (tg === 'visita') {
        interaccion.tipo_contacto = 'visita';
      } else if (tg === 'llamada') {
        interaccion.tipo_contacto = 'llamada';
      } else if (tg === 'mensaje') {
        interaccion.tipo_contacto = 'whatsapp';
      } else {
        interaccion.tipo_contacto = tg;
      }
      delete interaccion.tipo_gestion;
    }

    // 1. Capturar contexto de asignaciÃ³n antes de guardar para preservarlo histÃ³ricamente
    try {
      const socioIdStr = String(interaccion.socio_id || '');
      const socioIdNorm = this._normalizeId(socioIdStr);
      
      const client = this.supabaseService.getClient();
      const promise = interaccion.num_cuenta
        ? client.from('asignacion_gestores').select('NoCUENTA, "FECHA ASIGNACION"').eq('NoCUENTA', interaccion.num_cuenta)
        : client.from('asignacion_gestores').select('NoCUENTA, "FECHA ASIGNACION"').or(`NoSOCIO.eq.${socioIdStr},NoSOCIO.eq.${socioIdNorm}`);
      
      const { data: asigData } = await promise.limit(1);

      if (asigData && asigData.length > 0) {
        // Guardar snapshot de la asignaciÃ³n actual en la interacciÃ³n
        interaccion.num_cuenta = interaccion.num_cuenta || asigData[0].NoCUENTA;
        interaccion.fecha_inicio_gestion = interaccion.fecha_inicio_gestion || asigData[0]['FECHA ASIGNACION'];
      }
    } catch (e) {
      this.logger.warn(`Could not capture assignment context: ${e.message}`);
    }

    // 2. Aplicar detecciÃ³n inteligente antes de guardar
    if (interaccion.descripcion) {
      interaccion.sujeto_tipo = this._getSujetoEfectivo(interaccion);
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('cobranza_interacciones')
      .insert([interaccion])
      .select();

    if (error) {
      this.logger.error(`Error saving interaction: ${error.message}`);
      throw error;
    }
    return data[0];
  }

  async registrarPromesa(promesa: any) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('cobranza_promesas')
      .insert([promesa])
      .select();

    if (error) {
      this.logger.error(`Error saving promise: ${error.message}`);
      throw error;
    }
    return data[0];
  }

  async getInteraccionesSocio(socioId: number) {
    const result = await this.supabaseService.query(`
      SELECT ci.*,
             ug.gestor AS gestor_nombre
      FROM cobranza_interacciones ci
      LEFT JOIN usuarios_gestor ug ON ci.gestor_id = ug.id
      WHERE ci.socio_id = $1::text
      ORDER BY ci.fecha_gestion DESC
    `, [String(socioId)]);

    if (!result.rows) {
      this.logger.error(`Error fetching interactions for socio ${socioId}`);
      return [];
    }

    // Deduplicate in memory before doing joins using 120s window
    const uniqueData = this._deduplicateInteracciones(result.rows || []);

    return this._mapInteraccionesConAsignacion(uniqueData);
  }

  async getInteracciones(gestorId?: string, startDate?: string, endDate?: string) {
    let resolvedGestorId = gestorId;
    if (gestorId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gestorId)) {
      const { data: gData } = await this.supabaseService.getClient()
        .from('usuarios_gestor')
        .select('id')
        .ilike('gestor', `%${gestorId.trim()}%`)
        .limit(1);
      resolvedGestorId = gData && gData.length > 0 ? gData[0].id : '00000000-0000-0000-0000-000000000000';
    }

    // Usar SQL raw con JOIN para obtener el nombre del gestor correctamente
    // (PostgREST join syntax no es compatible con el QueryBuilder de PostgreSQL nativo)
    let allData: any[] = [];
    let offset = 0;
    const PAGE_SIZE = 1000;
    let hasMore = true;

    while (hasMore) {
      const params: any[] = [];
      let whereClauses: string[] = [];

      if (resolvedGestorId) {
        params.push(resolvedGestorId);
        whereClauses.push(`ci.gestor_id = $${params.length}::uuid`);
      }
      if (startDate) {
        params.push(this._toUTCStartOfDay(startDate));
        whereClauses.push(`ci.fecha_gestion >= $${params.length}`);
      }
      if (endDate) {
        params.push(this._toUTCEndOfDay(endDate));
        whereClauses.push(`ci.fecha_gestion <= $${params.length}`);
      }

      const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
      params.push(PAGE_SIZE);
      params.push(offset);

      const sql = `
        SELECT ci.*,
               ug.gestor AS gestor_nombre
        FROM cobranza_interacciones ci
        LEFT JOIN usuarios_gestor ug ON ci.gestor_id = ug.id
        ${whereStr}
        ORDER BY ci.fecha_gestion DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `;

      try {
        const result = await this.supabaseService.query(sql, params);
        const pageData = result.rows;

        if (pageData && pageData.length > 0) {
          allData = [...allData, ...pageData];
          if (pageData.length < PAGE_SIZE) {
            hasMore = false;
          } else {
            offset += PAGE_SIZE;
          }
        } else {
          hasMore = false;
        }
      } catch (err: any) {
        this.logger.error(`Error fetching page [${offset}-${offset + PAGE_SIZE - 1}]: ${err.message}`);
        throw err;
      }

      // Seguridad: No recuperar mÃ¡s de 5,000 en un solo reporte para evitar timeout del backend
      if (allData.length >= 5000) {
        hasMore = false;
      }
    }

    const data = allData;
    this.logger.log(`Se recuperaron un total de ${data.length} interacciones de la base de datos (paginaciÃ³n completada).`);

    // Deduplicate in memory before doing joins using 120s window
    const uniqueData = this._deduplicateInteracciones(data || []);

    if (uniqueData.length !== data.length) {
      this.logger.log(`Deduplicados en memoria: ${data.length - uniqueData.length} registros duplicados filtrados.`);
    }

    // Manual join with asignacion_gestores and socios_datos
    return this._mapInteraccionesConAsignacion(uniqueData);
  }

  private _extractMonto(desc: string): number {
    if (!desc) return 0;
    const match = desc.match(/(?:\$|abonará\s*|abona\s*|monto\s*|\$\s*)(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+)/i);
    if (match) {
      const valStr = match[1].replace(/,/g, '');
      const num = parseFloat(valStr);
      if (!isNaN(num) && num > 50 && num < 1000000) return num;
    }
    return 0;
  }

  async getPromesasPendientes(gestorId?: string, startDate?: string, endDate?: string) {
    let resolvedGestorId: string | null = null;
    let gestorName: string | null = null;

    // Resolver gestor_id y nombre del gestor
    if (gestorId) {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gestorId)) {
        const { data: gData } = await this.supabaseService.getClient()
          .from('usuarios_gestor').select('id, gestor').eq('id', gestorId).limit(1);
        if (gData && gData.length > 0) { resolvedGestorId = gData[0].id; gestorName = gData[0].gestor; }
      } else {
        const { data: gData } = await this.supabaseService.getClient()
          .from('usuarios_gestor').select('id, gestor').ilike('gestor', `%${gestorId.trim()}%`).limit(1);
        if (gData && gData.length > 0) { resolvedGestorId = gData[0].id; gestorName = gData[0].gestor; }
      }
    }

    // =====================================================================
    // 1. Interacciones con resultado 'promesa_pago'
    // =====================================================================
    const intParams: any[] = [];
    const intWhere: string[] = [`ci.resultado = 'promesa_pago'`];

    if (resolvedGestorId) {
      intParams.push(resolvedGestorId);
      intWhere.push(`ci.gestor_id = $${intParams.length}::uuid`);
    }
    if (startDate) {
      intParams.push(this._toUTCStartOfDay(startDate));
      intWhere.push(`ci.fecha_gestion >= $${intParams.length}`);
    }
    if (endDate) {
      intParams.push(this._toUTCEndOfDay(endDate));
      intWhere.push(`ci.fecha_gestion <= $${intParams.length}`);
    }

    intParams.push(3000);
    const intWhereStr = intWhere.length > 0 ? `WHERE ${intWhere.join(' AND ')}` : '';

    const intSQL = `
      SELECT ci.id, ci.socio_id, ci.fecha_gestion, ci.descripcion,
             ci.gestor_id, ci.sujeto_tipo, ci.prestamo_id, ci.num_cuenta,
             ug.gestor AS gestor_nombre,
             cp.id AS promesa_id, cp.monto_prometido, cp.fecha_promesa, cp.estado
      FROM cobranza_interacciones ci
      LEFT JOIN usuarios_gestor ug ON ci.gestor_id = ug.id
      LEFT JOIN cobranza_promesas cp ON cp.interaccion_id = ci.id
      ${intWhereStr}
      ORDER BY ci.fecha_gestion DESC
      LIMIT $${intParams.length}
    `;

    let interacciones: any[] = [];
    try {
      const intResult = await this.supabaseService.query(intSQL, intParams);
      interacciones = intResult.rows || [];
    } catch (e: any) {
      this.logger.error(`Error fetching interacciones promesas: ${e.message}`);
    }

    // Deduplicar para tomar la última promesa por socio
    const uniqueBySocio = new Map<string, any>();
    interacciones.forEach(item => {
      const sKey = String(item.socio_id || '').trim();
      if (sKey && !uniqueBySocio.has(sKey)) {
        uniqueBySocio.set(sKey, item);
      }
    });

    const dedupedList = Array.from(uniqueBySocio.values());

    // =====================================================================
    // 2. Enriquecer con nombre de socio desde asignacion_gestores
    // =====================================================================
    const uniqueSocioIds = [...new Set(dedupedList.map(i => i.socio_id).filter(Boolean))];
    let avalesMap: Map<string, any> = new Map();

    if (uniqueSocioIds.length > 0) {
      const avalesData = await this._fetchInBatches(
        'asignacion_gestores', 'NoSOCIO', uniqueSocioIds,
        'NoSOCIO, NoCUENTA, NOMBRE, "NOMBRE D.A.1", "NOMBRE D.A.2", "FECHA ASIGNACION"'
      );
      avalesData.forEach((a: any) => avalesMap.set(String(a.NoSOCIO).trim(), a));
    }

    // =====================================================================
    // 3. Mapear respuesta
    // =====================================================================
    return dedupedList.map(i => {
      const sujetoEfectivo = this._getSujetoEfectivo(i);
      const isAval = sujetoEfectivo.startsWith('Aval');
      const iStr = String(i.socio_id || '').trim();
      const asig = avalesMap.get(iStr) || null;

      const socioName = asig?.NOMBRE || '';
      let avalName = null;
      if (sujetoEfectivo === 'Aval 1') avalName = asig?.['NOMBRE D.A.1'];
      else if (sujetoEfectivo === 'Aval 2') avalName = asig?.['NOMBRE D.A.2'];
      else avalName = asig?.['NOMBRE D.A.1'] || asig?.['NOMBRE D.A.2'];

      const montoNum = Number(i.monto_prometido || 0) || this._extractMonto(i.descripcion);

      return {
        id: i.id,
        is_informal: !i.promesa_id,
        num_cuenta: i.num_cuenta || asig?.NoCUENTA || 'Bitácora',
        monto: montoNum,
        fecha_pago: i.fecha_promesa || i.fecha_gestion,
        estado: i.estado || 'pendiente',
        descripcion: i.descripcion,
        gestor_id: i.gestor_id,
        gestor_nombre: i.gestor_nombre,
        socio_id: i.socio_id,
        nombre_visitado: isAval ? (avalName || (socioName ? `Aval de ${socioName}` : null)) : socioName,
        sujeto_tipo: sujetoEfectivo,
        fecha_inicio_gestion: asig?.['FECHA ASIGNACION'],
        prestamos_datos: {
          socios_datos: {
            nombre_completo: socioName
          }
        }
      };
    });
  }
}



