function getApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host.includes('cobranza') && !host.startsWith('api-')) {
      return `${window.location.protocol}//api-${host}`;
    }
  }
  return 'http://localhost:4000';
}

const API_URL = getApiUrl();

function getAuthHeader(): Record<string, string> {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('auth_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }
  return {};
}

export async function login(email: string, pass: string) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pass }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'Credenciales inválidas');
  }
  const data = await res.json();
  localStorage.setItem('auth_token', data.access_token);
  localStorage.setItem('user_info', JSON.stringify(data.user));
  return data;
}

export async function fetchGestoresLocations(): Promise<any[]> {
  const headers = getAuthHeader();
  const response = await fetch(`${API_URL}/portfolio/locations`, { headers });
  if (!response.ok) throw new Error("Failed to fetch gestores locations");
  return response.json();
}

export async function fetchAllGestores() {
  const response = await fetch(`${API_URL}/portfolio/gestores`, {
    headers: getAuthHeader(),
  });
  if (!response.ok) throw new Error('Failed to fetch all gestores');
  return response.json();
}

export function logout() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('user_info');
  window.location.href = '/login';
}

export async function fetchSocios(limit = 50, gestorId?: string) {
  const headers = getAuthHeader();
  const url = gestorId 
    ? `${API_URL}/portfolio/socios?limit=${limit}&gestorId=${encodeURIComponent(gestorId)}`
    : `${API_URL}/portfolio/socios?limit=${limit}`;
    
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error('Failed to fetch socios');
  return res.json();
}

export async function fetchCarteraVencida(gestorId?: string) {
  const headers = getAuthHeader();
  const url = gestorId 
    ? `${API_URL}/portfolio/vencida?gestorId=${encodeURIComponent(gestorId)}`
    : `${API_URL}/portfolio/vencida`;
    
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error('Failed to fetch cartera vencida');
  return res.json();
}

export async function fetchPromesasPendientes(gestorId?: string, startDate?: string, endDate?: string) {
  const headers = getAuthHeader();
  let url = `${API_URL}/crm/promesas/pendientes?`;
  
  const params = new URLSearchParams();
  if (gestorId) params.append('gestorId', gestorId);
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  
  const res = await fetch(url + params.toString(), { 
    headers,
    cache: 'no-store'
  });
  if (!res.ok) throw new Error('Failed to fetch pending promises');
  return res.json();
}

export async function fetchAsignaciones(limit = 100, gestorId?: string): Promise<any[]> {
  const headers = getAuthHeader();
  let url = `${API_URL}/portfolio/asignaciones?limit=${limit}`;
  
  if (gestorId && gestorId !== 'all') {
    url += `&gestorId=${encodeURIComponent(gestorId)}`;
  }
    
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error("Failed to fetch asignaciones");
  return response.json();
}

export async function fetchRecuperacion(gestorId?: string, startDate?: string, endDate?: string): Promise<any[]> {
  const headers = getAuthHeader();
  const params = new URLSearchParams();
  if (gestorId && gestorId !== 'all') params.append('gestorId', gestorId);
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);

  const url = `${API_URL}/portfolio/recuperacion?${params.toString()}`;
    
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error("Failed to fetch recovery data");
  return response.json();
}

export async function registrarInteraccion(data: any) {
  const res = await fetch(`${API_URL}/crm/interacciones`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      ...getAuthHeader()
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to register interaction');
  return res.json();
}

export async function fetchInteracciones(gestorId?: string, startDate?: string, endDate?: string): Promise<any[]> {
  const headers = getAuthHeader();
  let url = `${API_URL}/crm/interacciones?`;
  
  const params = new URLSearchParams();
  if (gestorId) params.append('gestorId', gestorId);
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
    
  const response = await fetch(url + params.toString(), { headers });
  if (!response.ok) throw new Error("Failed to fetch interactions");
  return response.json();
}

export async function fetchInteraccionesSocio(socioId: number): Promise<any[]> {
  const headers = getAuthHeader();
  const response = await fetch(`${API_URL}/crm/socios/${socioId}/historial`, { headers });
  if (!response.ok) throw new Error("Failed to fetch socio history");
  return response.json();
}

export async function actualizarAsignacion(noCuenta: string, data: any) {
  const res = await fetch(`${API_URL}/portfolio/asignaciones/${encodeURIComponent(noCuenta)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader()
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update assignment');
  return res.json();
}
export async function fetchRentas(): Promise<any[]> {
  const response = await fetch(`${API_URL}/renta`, {
    headers: getAuthHeader(),
  });
  if (!response.ok) throw new Error("Failed to fetch rent data");
  return response.json();
}

export async function upsertRenta(data: any) {
  const res = await fetch(`${API_URL}/renta`, {
    method: 'POST', // Usamos POST para upsert
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader()
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update rent info');
  return res.json();
}

export async function importAvales(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  
  const res = await fetch(`${API_URL}/portfolio/import-avales`, {
    method: 'POST',
    headers: {
      ...getAuthHeader()
    },
    body: formData,
  });
  
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'Error al importar avales');
  }
  
  return res.json();
}
