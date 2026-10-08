import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import * as XLSX from 'xlsx';

@Injectable()
export class PortfolioService {
  private readonly logger = new Logger(PortfolioService.name);

  constructor(private supabaseService: SupabaseService) {}

  async getSocios(limit = 50, gestorId?: string) {
    let query = this.supabaseService
      .getClient()
      .from('socios_datos')
      .select('*')
      .limit(limit);

    if (gestorId) {
      const { data: asignaciones } = await this.supabaseService
        .getClient()
        .from('asignacion_gestores')
        .select('NoSOCIO')
        .eq('GESTOR ASIGNADO', gestorId)
        .neq('SITUACIÓN DEL CRÉDITO', 'LIQUIDADO');
      
      const sociosIds = asignaciones?.map(a => a.NoSOCIO) || [];
      query = query.in('numero_socio', sociosIds);
    }

    const { data, error } = await query;
    if (error) {
      this.logger.error(`Error fetching socios: ${error.message}`);
      throw error;
    }
    return data;
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
    let query = this.supabaseService
      .getClient()
      .from('prestamos_datos')
      .select('*, socios_datos(nombre_completo)')
      .gt('saldo_mora', 0)
      .limit(100); // Límite para evitar consumo excesivo

    if (gestorId) {
       const { data: asignaciones } = await this.supabaseService
         .getClient()
         .from('asignacion_gestores')
         .select('NoCUENTA')
         .eq('GESTOR ASIGNADO', gestorId);
       
       const cuentasIds = asignaciones?.map(a => a.NoCUENTA) || [];
       query = query.in('num_cuenta', cuentasIds);
    }

    const { data, error } = await query;

    if (error) {
      this.logger.error(`Error fetching cartera vencida: ${error.message}`);
      throw error;
    }
    return data;
  }

  async getAsignaciones(limit = 100, gestorId?: string) {
    let query = this.supabaseService
      .getClient()
      .from('asignacion_gestores')
      .select('*')
      .limit(limit);

    if (gestorId) {
      query = query.eq('GESTOR ASIGNADO', gestorId)
                   .neq('SITUACIÓN DEL CRÉDITO', 'LIQUIDADO');
    }

    query = query.order('FECHA ASIGNACION', { ascending: false });

    const { data, error } = await query;

    if (error) {
      this.logger.error(`Error fetching asignaciones: ${error.message}`);
      throw error;
    }
    return data;
  }

  async getCuentasAlCorriente(gestorId?: string) {
    try {
      // 1. Resguardo automático permanente: Si hay cuentas preventivas o con mora <= 0 en asignaciones,
      // se copian y aseguran en cuentas_al_corriente_historico para que NUNCA se pierdan aunque salgan de asignaciones
      await this.supabaseService.query(`
        INSERT INTO cuentas_al_corriente_historico (
          nocuenta, nosocio, nombre, gestor_asignado, producto, 
          saldo_total, saldo_al_dia, dias_mora, situacion_del_credito, 
          ultimo_pago, proximo_vencimiento, telefonos, origen
        )
        SELECT 
          "NoCUENTA", "NoSOCIO", "NOMBRE", 
          TRIM(REGEXP_REPLACE("GESTOR ASIGNADO", '^AL CORRIENTE - ', '', 'i')), 
          "Producto",
          COALESCE("SALDO TOTAL"::numeric, 0), COALESCE("SALDO AL DIA"::numeric, 0), 
          COALESCE("DIAS MORA"::integer, 0), COALESCE("SITUACIÓN DEL CRÉDITO", 'AL CORRIENTE'),
          "ULTIMO PAGO", "PRÓXIMO VENCIMIENTO", "TELEFONOS", 'AUTO_SYNC'
        FROM asignacion_gestores
        WHERE ("SITUACIÓN DEL CRÉDITO" = 'PREVENTIVA' OR "SITUACIÓN DEL CRÉDITO" = 'AL CORRIENTE' OR "DIAS MORA"::numeric <= 0)
        ON CONFLICT (nocuenta, gestor_asignado) DO UPDATE SET
          saldo_total = EXCLUDED.saldo_total,
          saldo_al_dia = EXCLUDED.saldo_al_dia,
          dias_mora = EXCLUDED.dias_mora,
          situacion_del_credito = EXCLUDED.situacion_del_credito,
          ultimo_pago = EXCLUDED.ultimo_pago,
          proximo_vencimiento = EXCLUDED.proximo_vencimiento,
          telefonos = EXCLUDED.telefonos,
          fecha_resguardo = NOW();
      `).catch(e => this.logger.warn(`Auto-sync cuentas al corriente warning: ${e.message}`));

      // 2. Consultar directamente desde la tabla permanente histórica
      let sql = `
        SELECT 
          nocuenta AS "NoCUENTA",
          nosocio AS "NoSOCIO",
          nombre AS "NOMBRE",
          gestor_asignado AS "GESTOR ASIGNADO",
          producto AS "Producto",
          saldo_total AS "SALDO TOTAL",
          saldo_al_dia AS "SALDO AL DIA",
          ultimo_pago AS "ULTIMO PAGO",
          proximo_vencimiento AS "PRÓXIMO VENCIMIENTO",
          situacion_del_credito AS "SITUACIÓN DEL CRÉDITO",
          dias_mora AS "DIAS MORA",
          telefonos AS "TELEFONOS",
          fecha_resguardo
        FROM cuentas_al_corriente_historico
        WHERE 1=1
      `;
      const params: any[] = [];
      if (gestorId && gestorId !== 'all') {
        params.push(gestorId);
        sql += ` AND gestor_asignado = $1`;
      }
      sql += ` ORDER BY nombre ASC`;

      const result = await this.supabaseService.query(sql, params);
      return result?.rows || [];
    } catch (error: any) {
      this.logger.error(`Error fetching cuentas al corriente: ${error.message}`);
      return [];
    }
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

  async getDashboardKpis(gestorId?: string, startDate?: string, endDate?: string) {
    try {
      // 1. Calcular métricas reales de cartera y mora desde asignacion_gestores
      let queryAsig = this.supabaseService
        .getClient()
        .from('asignacion_gestores')
        .select('"SALDO TOTAL", "DIAS MORA", "SITUACIÓN DEL CRÉDITO", "GESTOR ASIGNADO"');

      if (gestorId && gestorId !== 'all') {
        queryAsig = queryAsig.eq('GESTOR ASIGNADO', gestorId);
      }

      const allAsig: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await queryAsig.range(from, from + pageSize - 1);
        if (error) {
          this.logger.error(`Error fetching asignaciones for KPIs: ${error.message}`);
          break;
        }
        if (!data || data.length === 0) break;
        allAsig.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }

      let totalCartera = 0;
      let totalVencido = 0;
      let casosEnMora = 0;
      let moraTemprana = 0;

      for (const item of allAsig) {
        if (item['SITUACIÓN DEL CRÉDITO'] !== 'LIQUIDADO') {
          const saldo = Number(item['SALDO TOTAL']) || 0;
          const dias = Number(item['DIAS MORA']) || 0;
          totalCartera += saldo;
          if (dias > 0) {
            totalVencido += saldo;
            casosEnMora++;
            if (dias <= 30) moraTemprana++;
          }
        }
      }

      // 2. Calcular monto recuperado y cobros validados reales desde pagos_recuperados
      let queryPagos = this.supabaseService
        .getClient()
        .from('pagos_recuperados')
        .select('id, abono_total, fecha_real, num_credito, nocuenta, gestor_asignado')
        .gt('abono_total', 0);

      if (startDate) queryPagos = queryPagos.gte('fecha_real', this._toUTCStartOfDay(startDate));
      if (endDate) queryPagos = queryPagos.lte('fecha_real', this._toUTCEndOfDay(endDate));

      const allPagos: any[] = [];
      from = 0;
      while (true) {
        const { data, error } = await queryPagos.range(from, from + pageSize - 1);
        if (error) {
          this.logger.error(`Error fetching pagos for KPIs: ${error.message}`);
          break;
        }
        if (!data || data.length === 0) break;
        allPagos.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }

      let finalPagos = allPagos;
      if (gestorId && gestorId !== 'all') {
        finalPagos = allPagos.filter(p => p.gestor_asignado === gestorId);
      }

      const montoRecuperado = finalPagos.reduce((acc, curr) => acc + (Number(curr.abono_total) || 0), 0);
      const cobrosValidados = finalPagos.length;

      return {
        totalCartera,
        totalVencido,
        casosEnMora,
        moraTemprana,
        totalCasos: allAsig.length,
        montoRecuperado,
        cobrosValidados
      };
    } catch (err: any) {
      this.logger.error(`Fatal error in getDashboardKpis: ${err.message}`);
      return {
        totalCartera: 0,
        totalVencido: 0,
        casosEnMora: 0,
        moraTemprana: 0,
        totalCasos: 0,
        montoRecuperado: 0,
        cobrosValidados: 0
      };
    }
  }

  async getRecuperacion(gestorId?: string, startDate?: string, endDate?: string) {
    const recoveryDocs: any[] = [];

    try {
      // 1. Obtener de pagos_recuperados únicamente pagos reales con abono_total > 0
      let queryPagos = this.supabaseService
        .getClient()
        .from('pagos_recuperados')
        .select('*')
        .gt('abono_total', 0);

      if (startDate) queryPagos = queryPagos.gte('fecha_real', this._toUTCStartOfDay(startDate));
      if (endDate) queryPagos = queryPagos.lte('fecha_real', this._toUTCEndOfDay(endDate));

      const { data: pagosLog, error: errorPagos } = await queryPagos
        .order('fecha_real', { ascending: false })
        .limit(200);

      if (errorPagos) {
        this.logger.error(`Error fetching pagos_recuperados: ${errorPagos.message}`);
      } else if (pagosLog && pagosLog.length > 0) {
        const cuentas = [...new Set(pagosLog.map(p => p.num_credito || p.nocuenta).filter(Boolean))];
        const { data: gestoresMap } = await this.supabaseService
          .getClient()
          .from('asignacion_gestores')
          .select('NoCUENTA, "GESTOR ASIGNADO"')
          .in('NoCUENTA', cuentas);
          
        const gestorByCuenta = new Map(gestoresMap?.map(g => [g.NoCUENTA, g['GESTOR ASIGNADO']]) || []);
        
        pagosLog.forEach(item => {
          const cred = item.num_credito || item.nocuenta || 'N/A';
          const gestorResponsable = item.gestor_asignado || gestorByCuenta.get(cred) || 'Sistema';
          if (!gestorId || gestorId === 'all' || gestorResponsable === gestorId) {
            recoveryDocs.push({
              id: item.id,
              abono_total: Number(item.abono_total) || 0,
              nombre: item.nombre || 'Sin nombre',
              numero_socio: item.numero_socio || item.nosocio || 'N/A',
              num_credito: cred,
              fecha_real: item.fecha_real || item.created_at || item.fecha,
              gestor: gestorResponsable,
              tipo: 'PAGO_REAL'
            });
          }
        });
      }

      recoveryDocs.sort((a, b) => {
        const dateA = new Date(a.fecha_real || 0).getTime();
        const dateB = new Date(b.fecha_real || 0).getTime();
        return dateB - dateA;
      });

    } catch (err: any) {
      this.logger.error(`Fatal error in getRecuperacion: ${err.message}`);
    }

    return recoveryDocs;
  }

  async getAllGestoresLocations() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('ubicaciones_gestores')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(300); // Límite razonable para encontrar la última ubicación de cada gestor sin bajar miles

    if (error) {
      this.logger.error(`Error fetching gestores locations: ${error.message}`);
      throw error;
    }

    // Filtrar para obtener solo la última ubicación de cada gestor
    const uniqueLocations = new Map();
    data?.forEach(loc => {
      if (!uniqueLocations.has(loc.gestor_id)) {
        uniqueLocations.set(loc.gestor_id, loc);
      }
    });

    // Mapear con los nombres reales de los gestores desde usuarios_gestor
    const gestoresMap = new Map<string, string>();
    try {
      const gestoresList = await this.getAllGestores();
      gestoresList?.forEach((g: any) => {
        if (g.gestor_id && g.gestor_name) {
          gestoresMap.set(g.gestor_id, g.gestor_name);
        }
      });
    } catch (err: any) {
      this.logger.warn(`No se pudieron cargar nombres de gestores: ${err.message}`);
    }

    return Array.from(uniqueLocations.values()).map(loc => ({
      ...loc,
      gestor_name: gestoresMap.get(loc.gestor_id) || loc.usuarios_gestor?.gestor || 'Gestor'
    }));
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
    const { data: result, error } = await this.supabaseService
      .getClient()
      .from('asignacion_gestores')
      .update(data)
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

    // 2. Autocompletar Latitud y Longitud INMEDIATAMENTE antes de insertar
    this.logger.log(`Autocompletando latitud y longitud para ${assignments.length} avales...`);
    await this.enrichAssignmentsWithCoordinates(assignments);

    this.logger.log(`Limpiando tabla asignacion_avales e importando ${assignments.length} registros con coordenadas...`);
    // Borrar de forma segura ahora que sabemos que tenemos datos listos para insertar
    await this.supabaseService.getClient().from('asignacion_avales').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // Insertar en lotes en PostgreSQL Dokploy (con latitud y longitud incluidas)
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

    // Replicar en Supabase Cloud con latitud y longitud
    try {
      const cloudClient = this.supabaseService.getCloudClient();
      if (cloudClient) {
        this.logger.log(`Sincronizando ${assignments.length} avales con coordenadas a Supabase Cloud...`);
        await cloudClient.from('asignacion_avales').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        for (let i = 0; i < assignments.length; i += 200) {
          const batch = assignments.slice(i, i + 200);
          const { error: cloudErr } = await cloudClient.from('asignacion_avales').insert(batch);
          if (cloudErr) {
            this.logger.error(`Error en lote Supabase Cloud ${i}: ${cloudErr.message}`);
          }
        }
        this.logger.log(`✅ Sincronización de avales a Supabase Cloud finalizada.`);
      }
    } catch (cloudErr: any) {
      this.logger.error(`Error al replicar en Supabase Cloud: ${cloudErr.message}`);
    }

    return {
      success: true,
      totalProcesados: data.length,
      insertados: insertedCount,
      gestoresNoEncontrados: Array.from(unmatchedGestores)
    };
  }

  async enrichAssignmentsWithCoordinates(assignments: any[]) {
    try {
      // 1. Asegurar tabla de catálogo de direcciones en PostgreSQL
      await this.supabaseService.query(`
        CREATE TABLE IF NOT EXISTS catalogo_direcciones_geocodificadas (
          direccion_normalizada TEXT PRIMARY KEY,
          latitud NUMERIC,
          longitud NUMERIC,
          actualizado_al TIMESTAMP DEFAULT NOW()
        );
      `);

      // 2. Cargar catálogo existente
      const resCat = await this.supabaseService.query(
        'SELECT direccion_normalizada, latitud, longitud FROM catalogo_direcciones_geocodificadas'
      );
      const catalog = new Map<string, { lat: number; lng: number }>();
      for (const row of resCat?.rows || []) {
        catalog.set(row.direccion_normalizada, {
          lat: parseFloat(row.latitud),
          lng: parseFloat(row.longitud)
        });
      }

      const clean = (s: string) => (s || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const cleanStreet = (dom: string) => {
        if (!dom) return '';
        return dom.toUpperCase()
          .replace(/#/g, '')
          .replace(/N\.?\s*INT\.?.*/i, '')
          .replace(/INT\.?.*/i, '')
          .replace(/\bSN\b/gi, '')
          .replace(/\bS\/N\b/gi, '')
          .replace(/DOMICILIO CONOCIDO/gi, '')
          .replace(/CONOCIDO/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
      };

      const getAddrKey = (a: any) => {
        return [
          clean(a.domicilio_aval),
          clean(a.colonia_aval),
          clean(a.municipio_aval),
          clean(a.cp_aval),
          clean(a.estado_aval || 'JALISCO')
        ].join('|');
      };

      // 3. Identificar direcciones pendientes de geocodificar
      const pendingMap = new Map<string, any>();
      for (const a of assignments) {
        const key = getAddrKey(a);
        if (!catalog.has(key) && !pendingMap.has(key)) {
          pendingMap.set(key, a);
        }
      }

      // 4. Geocodificar las direcciones nuevas (si las hay)
      const token = process.env.MAPBOX_ACCESS_TOKEN;
      if (pendingMap.size > 0 && token) {
        this.logger.log(`Geocodificando ${pendingMap.size} direcciones nuevas con Mapbox...`);
        const pendingList = Array.from(pendingMap.entries());

        const geocodeQuery = async (q: string): Promise<{ lat: number; lng: number } | null> => {
          const query = q.trim();
          if (!query) return null;
          try {
            const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&limit=1&country=mx`;
            const resp = await fetch(url);
            if (resp.ok) {
              const data: any = await resp.json();
              if (data.features && data.features.length > 0) {
                const [lng, lat] = data.features[0].center;
                return { lat, lng };
              }
            }
          } catch {
            // ignore
          }
          return null;
        };

        const batchSize = 10;
        for (let i = 0; i < pendingList.length; i += batchSize) {
          const chunk = pendingList.slice(i, i + batchSize);
          await Promise.all(chunk.map(async ([key, a]) => {
            const street = cleanStreet(a.domicilio_aval || '');
            const col = (a.colonia_aval || '').trim();
            const mpo = (a.municipio_aval || '').trim();
            const edo = (a.estado_aval || 'JALISCO').trim();
            const cp = (a.cp_aval || '').trim();

            let coords: { lat: number; lng: number } | null = null;
            if (street) {
              coords = await geocodeQuery(`${street}, ${col ? col + ', ' : ''}${mpo}, ${edo}, Mexico`);
            }
            if (!coords && street && cp) {
              coords = await geocodeQuery(`${street}, C.P. ${cp}, ${edo}, Mexico`);
            }
            if (!coords && col) {
              coords = await geocodeQuery(`${col}, ${mpo}, ${edo}, Mexico`);
            }
            if (!coords && mpo) {
              coords = await geocodeQuery(`${mpo}, ${edo}, Mexico`);
            }
            if (!coords) {
              coords = { lat: 20.659698, lng: -103.349609 };
            }

            catalog.set(key, coords);
            await this.supabaseService.query(`
              INSERT INTO catalogo_direcciones_geocodificadas (direccion_normalizada, latitud, longitud)
              VALUES ($1, $2, $3)
              ON CONFLICT (direccion_normalizada) DO NOTHING
            `, [key, coords.lat, coords.lng]);
          }));
        }
      }

      // 5. Asignar latitud y longitud a cada aval
      for (const a of assignments) {
        const key = getAddrKey(a);
        const coords = catalog.get(key) || { lat: 20.659698, lng: -103.349609 };
        a.latitud = coords.lat;
        a.longitud = coords.lng;
      }

      this.logger.log(`✅ Coordenadas asignadas a todos los ${assignments.length} registros antes de la inserción.`);
    } catch (err: any) {
      this.logger.error(`Error al enriquecer con coordenadas: ${err.message}`);
      for (const a of assignments) {
        if (!a.latitud) a.latitud = 20.659698;
        if (!a.longitud) a.longitud = -103.349609;
      }
    }
  }

  async geocodePendingAvales() {
    const token = process.env.MAPBOX_ACCESS_TOKEN;
    if (!token) {
      this.logger.warn('MAPBOX_ACCESS_TOKEN no configurado. Se omite geocodificación automática.');
      return;
    }

    try {
      this.logger.log('Iniciando geocodificación de avales pendientes...');
      const res = await this.supabaseService.query(`
        SELECT id, domicilio_aval, colonia_aval, municipio_aval, estado_aval, cp_aval
        FROM asignacion_avales
        WHERE latitud IS NULL OR latitud = '' OR longitud IS NULL OR longitud = ''
        LIMIT 3500;
      `);

      const rows = res?.rows || [];
      if (rows.length === 0) {
        this.logger.log('No hay avales pendientes de geocodificación.');
        return;
      }

      this.logger.log(`Geocodificando ${rows.length} avales...`);
      const cache = new Map<string, { lat: number; lng: number }>();

      const cleanStreet = (dom: string) => {
        if (!dom) return '';
        return dom.toUpperCase()
          .replace(/#/g, '')
          .replace(/N\.?\s*INT\.?.*/i, '')
          .replace(/INT\.?.*/i, '')
          .replace(/\bSN\b/gi, '')
          .replace(/\bS\/N\b/gi, '')
          .replace(/DOMICILIO CONOCIDO/gi, '')
          .replace(/CONOCIDO/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
      };

      const geocodeQuery = async (q: string): Promise<{ lat: number; lng: number } | null> => {
        const query = q.trim();
        if (!query) return null;
        if (cache.has(query)) return cache.get(query) || null;

        try {
          const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&limit=1&country=mx`;
          const resp = await fetch(url);
          if (resp.ok) {
            const data: any = await resp.json();
            if (data.features && data.features.length > 0) {
              const [lng, lat] = data.features[0].center;
              const coords = { lat, lng };
              cache.set(query, coords);
              return coords;
            }
          }
        } catch {
          // ignorar error individual
        }
        cache.set(query, null as any);
        return null;
      };

      const geocodeRow = async (row: any) => {
        const street = cleanStreet(row.domicilio_aval || '');
        const col = (row.colonia_aval || '').trim();
        const mpo = (row.municipio_aval || '').trim();
        const edo = (row.estado_aval || 'JALISCO').trim();
        const cp = (row.cp_aval || '').trim();

        if (street) {
          const q1 = `${street}, ${col ? col + ', ' : ''}${mpo}, ${edo}, Mexico`;
          const c1 = await geocodeQuery(q1);
          if (c1) return c1;
        }
        if (street && cp) {
          const q2 = `${street}, C.P. ${cp}, ${edo}, Mexico`;
          const c2 = await geocodeQuery(q2);
          if (c2) return c2;
        }
        if (col) {
          const q3 = `${col}, ${mpo}, ${edo}, Mexico`;
          const c3 = await geocodeQuery(q3);
          if (c3) return c3;
        }
        if (mpo) {
          const q4 = `${mpo}, ${edo}, Mexico`;
          const c4 = await geocodeQuery(q4);
          if (c4) return c4;
        }
        return { lat: 20.659698, lng: -103.349609 };
      };

      const batchSize = 10;
      for (let i = 0; i < rows.length; i += batchSize) {
        const chunk = rows.slice(i, i + batchSize);
        await Promise.all(chunk.map(async (row: any) => {
          const coords = await geocodeRow(row);
          if (coords) {
            await this.supabaseService.query(
              'UPDATE asignacion_avales SET latitud = $1, longitud = $2 WHERE id = $3',
              [String(coords.lat), String(coords.lng), row.id]
            );
          }
        }));
      }

      this.logger.log('✅ Geocodificación en PostgreSQL completada. Sincronizando con Supabase Cloud...');
      const cloudClient = this.supabaseService.getCloudClient();
      if (cloudClient) {
        const allRes = await this.supabaseService.query(`
          SELECT num_cuenta, nombre_aval, domicilio_aval, colonia_aval, municipio_aval, cp_aval,
                 cruces_aval, estado_aval, telefono_aval, gestor_asignado, tipo_aval,
                 latitud::numeric, longitud::numeric
          FROM asignacion_avales;
        `);
        const allRows = allRes?.rows || [];
        await cloudClient.from('asignacion_avales').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        for (let i = 0; i < allRows.length; i += 200) {
          const batch = allRows.slice(i, i + 200);
          await cloudClient.from('asignacion_avales').insert(batch);
        }
        this.logger.log('✅ Coordenadas de avales sincronizadas al 100% en Supabase Cloud.');
      }
    } catch (err: any) {
      this.logger.error(`Error en geocodePendingAvales: ${err.message}`);
    }
  }

  async getColoniasGestor(gestor: string) {
    try {
      const sql = `
        SELECT 
          COALESCE(NULLIF(TRIM(UPPER("COLONIA")), ''), 'SIN COLONIA ESPECIFICADA') as nombre,
          COUNT(*)::integer as "totalCuentas",
          SUM(COALESCE("SALDO TOTAL"::numeric, 0)) as "saldoTotal"
        FROM asignacion_gestores
        WHERE "GESTOR ASIGNADO" = $1
          AND ("SITUACIÓN DEL CRÉDITO" != 'LIQUIDADO' OR "SITUACIÓN DEL CRÉDITO" IS NULL)
        GROUP BY COALESCE(NULLIF(TRIM(UPPER("COLONIA")), ''), 'SIN COLONIA ESPECIFICADA')
        ORDER BY "totalCuentas" DESC
      `;
      const res = await this.supabaseService.query(sql, [gestor]);
      return res?.rows || [];
    } catch (err: any) {
      this.logger.error(`Error getColoniasGestor: ${err.message}`);
      return [];
    }
  }

  async getRutasProgramadas(gestor: string) {
    try {
      const sql = `
        SELECT id, gestor_nombre, fecha, colonia, total_cuentas, asignado_por, created_at
        FROM planificacion_rutas_diarias
        WHERE gestor_nombre = $1
        ORDER BY fecha ASC, colonia ASC
      `;
      const res = await this.supabaseService.query(sql, [gestor]);
      return res?.rows || [];
    } catch (err: any) {
      this.logger.error(`Error getRutasProgramadas: ${err.message}`);
      return [];
    }
  }

  async guardarRutasProgramadas(rutas: any[]) {
    try {
      for (const r of rutas) {
        await this.supabaseService.query(`
          INSERT INTO planificacion_rutas_diarias (
            gestor_nombre, fecha, colonia, total_cuentas, asignado_por
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (gestor_nombre, fecha, colonia) DO UPDATE SET
            total_cuentas = EXCLUDED.total_cuentas,
            asignado_por = EXCLUDED.asignado_por
        `, [r.gestor_nombre, r.fecha, r.colonia, r.total_cuentas || 0, r.asignado_por || 'Sistema']);
      }
      return { success: true };
    } catch (err: any) {
      this.logger.error(`Error guardarRutasProgramadas: ${err.message}`);
      throw err;
    }
  }

  async eliminarRutaProgramada(id: string) {
    try {
      await this.supabaseService.query(`DELETE FROM planificacion_rutas_diarias WHERE id = $1`, [id]);
      return { success: true };
    } catch (err: any) {
      this.logger.error(`Error eliminarRutaProgramada: ${err.message}`);
      throw err;
    }
  }

  async geocodificarPendientes() {
    try {
      const { iniciarGeocodificacion } = require('../../geocodificar-asignacion');
      // Ejecutar en segundo plano
      iniciarGeocodificacion().catch((err: any) => {
        this.logger.error(`Error en proceso de geocodificación: ${err?.message || err}`);
      });
      return {
        success: true,
        message: 'Proceso de geocodificación de socios sin coordenadas iniciado en segundo plano.'
      };
    } catch (err: any) {
      this.logger.error(`Error al disparar geocodificación: ${err?.message || err}`);
      return { success: false, error: err?.message || String(err) };
    }
  }
}
