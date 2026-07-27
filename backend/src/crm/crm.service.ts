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
    
    // Eliminar duplicados y nulos/vacíos
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

    // 1. Capturar contexto de asignación antes de guardar para preservarlo históricamente
    try {
      const socioIdStr = String(interaccion.socio_id || '');
      const socioIdNorm = this._normalizeId(socioIdStr);
      
      const client = this.supabaseService.getClient();
      const promise = interaccion.num_cuenta
        ? client.from('asignacion_gestores').select('NoCUENTA, "FECHA ASIGNACION"').eq('NoCUENTA', interaccion.num_cuenta)
        : client.from('asignacion_gestores').select('NoCUENTA, "FECHA ASIGNACION"').or(`NoSOCIO.eq.${socioIdStr},NoSOCIO.eq.${socioIdNorm}`);
      
      const { data: asigData } = await promise.limit(1);

      if (asigData && asigData.length > 0) {
        // Guardar snapshot de la asignación actual en la interacción
        interaccion.num_cuenta = interaccion.num_cuenta || asigData[0].NoCUENTA;
        interaccion.fecha_inicio_gestion = interaccion.fecha_inicio_gestion || asigData[0]['FECHA ASIGNACION'];
      }
    } catch (e) {
      this.logger.warn(`Could not capture assignment context: ${e.message}`);
    }

    // 2. Aplicar detección inteligente antes de guardar
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

      // Seguridad: No recuperar más de 5,000 en un solo reporte para evitar timeout del backend
      if (allData.length >= 5000) {
        hasMore = false;
      }
    }

    const data = allData;
    this.logger.log(`Se recuperaron un total de ${data.length} interacciones de la base de datos (paginación completada).`);

    // Deduplicate in memory before doing joins using 120s window
    const uniqueData = this._deduplicateInteracciones(data || []);

    if (uniqueData.length !== data.length) {
      this.logger.log(`Deduplicados en memoria: ${data.length - uniqueData.length} registros duplicados filtrados.`);
    }

    // Manual join with asignacion_gestores and socios_datos
    return this._mapInteraccionesConAsignacion(uniqueData);
  }

  async getPromesasPendientes(gestorId?: string, startDate?: string, endDate?: string) {
    let resolvedGestorId = gestorId;
    let gestorName = gestorId;
    if (gestorId) {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gestorId)) {
        // Resolve UUID to name
        const { data: gData } = await this.supabaseService.getClient()
          .from('usuarios_gestor')
          .select('id, gestor')
          .eq('id', gestorId)
          .limit(1);
        if (gData && gData.length > 0) {
          gestorName = gData[0].gestor;
          resolvedGestorId = gData[0].id;
        } else {
          resolvedGestorId = '00000000-0000-0000-0000-000000000000';
          gestorName = '';
        }
      } else {
        // Resolve name to UUID
        const { data: gData } = await this.supabaseService.getClient()
          .from('usuarios_gestor')
          .select('id, gestor')
          .ilike('gestor', `%${gestorId.trim()}%`)
          .limit(1);
        if (gData && gData.length > 0) {
          resolvedGestorId = gData[0].id;
          gestorName = gData[0].gestor;
        } else {
          resolvedGestorId = '00000000-0000-0000-0000-000000000000';
          gestorName = '';
        }
      }
    }

    // 1. Query structured promises from cobranza_promesas that are NOT linked to any interaction
    let promiseQuery = this.supabaseService
      .getClient()
      .from('cobranza_promesas')
      .select('*, prestamos_datos(num_cuenta, socio_id, socios_datos(friendly_code, nombre_completo))')
      .eq('estado', 'pendiente')
      .is('interaccion_id', null);

    if (gestorName) {
      const { data: asignaciones } = await this.supabaseService.getClient()
        .from('asignacion_gestores')
        .select('NoCUENTA')
        .eq('GESTOR ASIGNADO', gestorName);
      
      const cuentas = asignaciones?.map(a => a.NoCUENTA) || [];
      if (cuentas.length > 0) {
        const { data: pData } = await this.supabaseService.getClient()
          .from('prestamos_datos')
          .select('prestamo_id')
          .in('num_cuenta', cuentas);
        
        const pIds = pData?.map(p => p.prestamo_id) || [];
        if (pIds.length > 0) {
          promiseQuery = promiseQuery.in('prestamo_id', pIds);
        } else {
          promiseQuery = promiseQuery.in('prestamo_id', [-1]);
        }
      } else {
        promiseQuery = promiseQuery.in('prestamo_id', [-1]);
      }
    }

    if (startDate) promiseQuery = promiseQuery.gte('fecha_promesa', startDate);
    if (endDate) promiseQuery = promiseQuery.lte('fecha_promesa', endDate);

    // 2. Query informal and formal promises originating from cobranza_interacciones
    let interactionQuery = this.supabaseService
      .getClient()
      .from('cobranza_interacciones')
      .select('id, socio_id, fecha_gestion, descripcion, gestor_id, sujeto_tipo, prestamo_id, num_cuenta, cobranza_promesas(*)')
      .eq('resultado', 'promesa_pago')
      .order('fecha_gestion', { ascending: false });

    if (resolvedGestorId) {
      interactionQuery = interactionQuery.eq('gestor_id', resolvedGestorId);
    }
    
    if (startDate) interactionQuery = interactionQuery.gte('fecha_gestion', this._toUTCStartOfDay(startDate));
    if (endDate) interactionQuery = interactionQuery.lte('fecha_gestion', this._toUTCEndOfDay(endDate));

    const [promRes, intRes, gestoresRes] = await Promise.all([
      promiseQuery, 
      interactionQuery,
      this.supabaseService.getClient().from('usuarios_gestor').select('id, gestor')
    ]);

    if (promRes.error) throw promRes.error;
    if (intRes.error) throw intRes.error;

    const formalPromises = promRes.data || [];
    const rawInteractionPromises = intRes.data || [];

    // Deduplicate informal promises using 120s window
    const interactionPromises = this._deduplicateInteracciones(rawInteractionPromises || []);

    // Combine all socio IDs to fetch metadata once
    const allSocioIds = [
      ...formalPromises.map(p => p.prestamos_datos?.socio_id),
      ...interactionPromises.map(i => i.socio_id)
    ].filter(Boolean);

    const socioIds = [...new Set(allSocioIds.map(id => String(id)))];
    const searchIds = [...new Set([...socioIds, ...socioIds.map(id => this._normalizeId(id))])];

    const [avales, socios] = await Promise.all([
      this._fetchInBatches('asignacion_gestores', 'NoSOCIO', searchIds, 'NoSOCIO, NoCUENTA, NOMBRE, "NOMBRE D.A.1", "NOMBRE D.A.2", "FECHA ASIGNACION"'),
      this._fetchInBatches('socios_datos', 'friendly_code', searchIds, 'friendly_code, nombre_completo, socio_id')
    ]);

    const gestoresMap = new Map((gestoresRes.data || []).map(g => [g.id, g.gestor]));

    // Helper to find name and sujeto_tipo
    const getMetadata = (id: any, sujetoTipo: string = 'Socio', numCuenta?: string) => {
      const iIdNorm = this._normalizeId(id);
      const iIdOrig = String(id || '').trim();
      
      const foundAsig = avales.find(a => 
        (this._normalizeId(a.NoSOCIO) === iIdNorm || String(a.NoSOCIO).trim() === iIdOrig) &&
        (numCuenta ? a.NoCUENTA === numCuenta : true)
      ) || avales.find(a => this._normalizeId(a.NoSOCIO) === iIdNorm || String(a.NoSOCIO).trim() === iIdOrig);
      const foundSocio = socios.find(s => this._normalizeId(s.friendly_code) === iIdNorm || String(s.friendly_code).trim() === iIdOrig);
      
      const isAval = sujetoTipo.startsWith('Aval');
      const socioName = foundAsig?.NOMBRE || foundSocio?.nombre_completo;
      let avalName = null;
      if (sujetoTipo === 'Aval 1') {
        avalName = foundAsig?.['NOMBRE D.A.1'];
      } else if (sujetoTipo === 'Aval 2') {
        avalName = foundAsig?.['NOMBRE D.A.2'];
      } else {
        avalName = foundAsig?.['NOMBRE D.A.1'] || foundAsig?.['NOMBRE D.A.2'];
      }

      return {
        nombre_visitado: isAval ? (avalName || (socioName ? `Aval de ${socioName}` : null)) : socioName,
        sujeto_tipo: sujetoTipo,
        socio_id: foundSocio?.friendly_code || foundAsig?.NoSOCIO || id,
        num_cuenta: foundAsig?.NoCUENTA,
        fecha_inicio_gestion: foundAsig?.['FECHA ASIGNACION']
      };
    };

    const mappedFormal = formalPromises.map(p => {
      const metadata = getMetadata(p.prestamos_datos?.socio_id, 'Socio', p.prestamos_datos?.num_cuenta); // Default to Socio for formal if not linked to interaction
      return {
        ...p,
        monto: p.monto_prometido,
        fecha_pago: p.fecha_promesa,
        nombre_visitado: metadata.nombre_visitado || p.prestamos_datos?.socios_datos?.nombre_completo,
        socio_id: metadata.socio_id,
        num_cuenta: p.prestamos_datos?.num_cuenta || metadata.num_cuenta,
        sujeto_tipo: 'Socio', // Assume Socio for formal unless we fetch interaccion info
        gestor_nombre: gestoresMap.get(p.gestor_id)
      };
    });

    const mappedInformal = interactionPromises.map(i => {
      const sujetoEfectivo = this._getSujetoEfectivo(i);
      const metadata = getMetadata(i.socio_id, sujetoEfectivo, i.num_cuenta);
      
      const promArray = (i as any).cobranza_promesas;
      const hasFormal = Array.isArray(promArray) && promArray.length > 0;
      const formalPromise = hasFormal ? promArray[0] : null;

      const monto = formalPromise ? Number(formalPromise.monto_prometido || 0) : 0;
      const fechaPago = formalPromise ? formalPromise.fecha_promesa : i.fecha_gestion;
      const estado = formalPromise ? formalPromise.estado : 'pendiente';

      return {
        id: i.id,
        is_informal: !hasFormal,
        num_cuenta: metadata.num_cuenta || i.num_cuenta || 'Bitácora',
        monto: monto,
        fecha_pago: fechaPago,
        estado: estado,
        descripcion: i.descripcion,
        gestor_id: i.gestor_id,
        gestor_nombre: gestoresMap.get(i.gestor_id),
        socio_id: metadata.socio_id,
        nombre_visitado: metadata.nombre_visitado,
        sujeto_tipo: metadata.sujeto_tipo,
        prestamos_datos: {
          socios_datos: {
            nombre_completo: metadata.nombre_visitado
          }
        }
      };
    });

    return [...mappedFormal, ...mappedInformal];
  }
}
