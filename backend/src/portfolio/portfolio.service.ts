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

  async getAsignaciones(limit = 1000, gestorId?: string) {
    let query = this.supabaseService
      .getClient()
      .from('asignacion_gestores')
      .select('*');

    if (gestorId) {
      query = query.eq('GESTOR ASIGNADO', gestorId)
                   .neq('SITUACIÓN DEL CRÉDITO', 'LIQUIDADO');
    }

    // Para dar soporte a APKs instalados que envían limit=200, forzamos un mínimo de 1000 cuando hay gestorId
    const numLimit = Number(limit);
    const effectiveLimit = gestorId ? Math.max(isNaN(numLimit) ? 1000 : numLimit, 1000) : (isNaN(numLimit) ? 1000 : numLimit);
    query = query.limit(effectiveLimit);

    query = query.order('FECHA ASIGNACION', { ascending: false });

    const { data, error } = await query;

    if (error) {
      this.logger.error(`Error fetching asignaciones: ${error.message}`);
      throw error;
    }
    return data;
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
      // 1. Obtener de pagos_recuperados
      let queryPagos = this.supabaseService
        .getClient()
        .from('pagos_recuperados')
        .select('*');

      if (startDate) queryPagos = queryPagos.gte('fecha_real', this._toUTCStartOfDay(startDate));
      if (endDate) queryPagos = queryPagos.lte('fecha_real', this._toUTCEndOfDay(endDate));

      const { data: pagosLog, error: errorPagos } = await queryPagos
        .order('created_at', { ascending: false })
        .limit(200);

      if (errorPagos) {
        this.logger.error(`Error fetching pagos_recuperados: ${errorPagos.message}`);
      } else if (pagosLog && pagosLog.length > 0) {
        const cuentas = [...new Set(pagosLog.map(p => p.num_credito))];
        const { data: gestoresMap } = await this.supabaseService
          .getClient()
          .from('asignacion_gestores')
          .select('NoCUENTA, "GESTOR ASIGNADO"')
          .in('NoCUENTA', cuentas);
          
        const gestorByCuenta = new Map(gestoresMap?.map(g => [g.NoCUENTA, g['GESTOR ASIGNADO']]) || []);
        
        pagosLog.forEach(item => {
          const gestorResponsable = gestorByCuenta.get(item.num_credito) || 'Sistema';
          if (!gestorId || gestorResponsable === gestorId) {
            recoveryDocs.push({
              id: item.id,
              abono_total: item.abono_total,
              nombre: item.nombre,
              numero_socio: item.numero_socio,
              num_credito: item.num_credito,
              fecha_real: item.fecha_real || item.created_at || item.fecha,
              gestor: gestorResponsable,
              tipo: 'PAGO_REAL'
            });
          }
        });
      }

      // 2. Obtener de asignacion_gestores
      let queryActivos = this.supabaseService
        .getClient()
        .from('asignacion_gestores')
        .select('"GESTOR ASIGNADO", "CAPITAL MOROSO", NoSOCIO, NOMBRE, NoCUENTA, "FECHA ASIGNACION", "SITUACIÓN DEL CRÉDITO"');

      if (gestorId) queryActivos = queryActivos.eq('GESTOR ASIGNADO', gestorId);
      if (startDate) queryActivos = queryActivos.gte('FECHA ASIGNACION', startDate);
      if (endDate) queryActivos = queryActivos.lte('FECHA ASIGNACION', endDate);

      const { data: activos, error: errorActivos } = await queryActivos.limit(100);
      if (errorActivos) {
        this.logger.error(`Error fetching asignacion_gestores for recovery: ${errorActivos.message}`);
      } else if (activos) {
        activos.forEach(item => {
          if (item['CAPITAL MOROSO'] > 0 || item['SITUACIÓN DEL CRÉDITO'] === 'LIQUIDADO') {
            recoveryDocs.push({
              abono_total: item['CAPITAL MOROSO'],
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

      // 3. Obtener de recuperaciones_archivadas
      let histQuery = this.supabaseService
        .getClient()
        .from('recuperaciones_archivadas')
        .select('gestor_asignado, capital_moroso, nosocio, nombre, nocuenta, fecha_asignacion');
      
      if (gestorId) histQuery = histQuery.eq('gestor_asignado', gestorId);
      if (startDate) histQuery = histQuery.gte('fecha_asignacion', startDate);
      if (endDate) histQuery = histQuery.lte('fecha_asignacion', endDate);

      const { data: historicos, error: errorHistoricos } = await histQuery
        .order('fecha_asignacion', { ascending: false })
        .limit(100);

      if (errorHistoricos) {
        this.logger.error(`Error fetching recuperaciones_archivadas: ${errorHistoricos.message}`);
      } else if (historicos) {
        historicos.forEach(item => {
          recoveryDocs.push({
            abono_total: item.capital_moroso,
            nombre: item.nombre,
            numero_socio: item.nosocio,
            num_credito: item.nocuenta,
            fecha_real: item.fecha_asignacion,
            gestor: item.gestor_asignado,
            tipo: 'ARCHIVO'
          });
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
    const { data, error } = await this.supabaseService
      .getClient()
      .from('ubicaciones_gestores')
      .select('*, usuarios_gestor(gestor)')
      .order('timestamp', { ascending: false })
      .limit(200); // Límite razonable para encontrar la última ubicación de cada gestor sin bajar miles

    if (error) {
      this.logger.error(`Error fetching gestores locations: ${error.message}`);
      throw error;
    }

    // Filtrar para obtener solo la última ubicación de cada gestor
    const uniqueLocations = new Map();
    data?.forEach(loc => {
      if (!uniqueLocations.has(loc.gestor_id)) {
        uniqueLocations.set(loc.gestor_id, {
          ...loc,
          gestor_name: loc.usuarios_gestor?.gestor || 'Gestor'
        });
      }
    });

    return Array.from(uniqueLocations.values());
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
