const https = require('https');

const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5Z2FyY2h3eXJmbHB6eXdjcGlkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzE3MzU5NywiZXhwIjoyMDg4NzQ5NTk3fQ.NhK0bVSyLcWAP8EXU35agSs89DCq2LBhRTXv2_P-Y0A';
const hostname = 'xygarchwyrflpzywcpid.supabase.co';

const telefonistas = [
  {
    email: 'aux_riesgos1@cajaoblatos.com.mx',
    password_hash: 'Oblatos2026!Jm#7',
    rol: 'telefonista',
    gestor: 'JUAN MARTIN SALDAÑA CISNEROS'
  },
  {
    email: 'asistentecobranza@cajaoblatos.com.mx',
    password_hash: 'Oblatos2026!Ki#4',
    rol: 'telefonista',
    gestor: 'KARLA IVETTE SEGOVIANO HERNANDEZ'
  },
  {
    email: 'asesortelefonico2@cajaoblatos.com.mx',
    password_hash: 'Oblatos2026!Rm#9',
    rol: 'telefonista',
    gestor: 'ROSALBA MUÑOS LOPES'
  },
  {
    email: 'atencioncobranza2@cajaoblatos.com.mx',
    password_hash: 'Oblatos2026!Lm#3',
    rol: 'telefonista',
    gestor: 'MARTHA LETICIA MORA GONZALEZ'
  },
  {
    email: 'asesortelefonico1@cajaoblatos.com.mx',
    password_hash: 'Oblatos2026!Aj#8',
    rol: 'telefonista',
    gestor: 'AIDE JOCELINE GOMEZ FLORES'
  },
  {
    email: 'asesortelefonico@cajaobatos.com.mx', // Exacto como en la imagen
    password_hash: 'Oblatos2026!Kg#5',
    rol: 'telefonista',
    gestor: 'KENIA ALEJANDRA GARCIA ANGEL'
  },
  {
    email: 'asesortelefonico@cajaoblatos.com.mx', // Corrección en caso de typo en imagen
    password_hash: 'Oblatos2026!Kg#5',
    rol: 'telefonista',
    gestor: 'KENIA ALEJANDRA GARCIA ANGEL'
  },
  {
    email: 'atencioncobranza@cajaoblatos.com.mx',
    password_hash: 'Oblatos2026!Mb#2',
    rol: 'telefonista',
    gestor: 'MARIANA BERMUDEZ GONZALEZ'
  },
  {
    email: 'coordinador_cobranza@cajaoblatos.com.mx',
    password_hash: 'Oblatos2026!Rc#6',
    rol: 'telefonista',
    gestor: 'ROBERTO MIZAEL CORONA GUERRERO'
  },
  {
    email: 'juridico4@cajaoblatos.com.mx',
    password_hash: 'Oblatos2026!Ms#1',
    rol: 'telefonista',
    gestor: 'MAIRA MARILIA SERVIN SILVA'
  },
  {
    email: 'juridico1@cajaoblatos.com.mx',
    password_hash: 'Oblatos2026!Hf#7',
    rol: 'telefonista',
    gestor: 'HECTOR IVAN FLORES MACIAS'
  },
  {
    email: 'juridico3@cajaoblatos.com.mx',
    password_hash: 'Oblatos2026!Eb#4',
    rol: 'telefonista',
    gestor: 'ERIKA MARISOL BADILLO CRUZ'
  },
  {
    email: 'asistentejuridico@cajaoblatos.com.mx',
    password_hash: 'Oblatos2026!Ns#8',
    rol: 'telefonista',
    gestor: 'NAYELI STHEFANY SIERRA HERNANDEZ'
  }
];

async function createOrUpdateUser(user) {
  const data = JSON.stringify(user);

  const options = {
    hostname: hostname,
    port: 443,
    path: '/rest/v1/usuarios_gestor',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      'apikey': serviceKey,
      'Authorization': 'Bearer ' + serviceKey,
      'Content-Length': Buffer.byteLength(data)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 201) {
          console.log(`✓ Creado: ${user.email} (${user.gestor})`);
          resolve(body);
        } else {
          console.error(`✗ Error al crear ${user.email}: ${res.statusCode} - ${body}`);
          resolve(null);
        }
      });
    });

    req.on('error', (err) => {
      console.error(`Error de red en ${user.email}:`, err);
      reject(err);
    });
    req.write(data);
    req.end();
  });
}

async function run() {
  console.log('Iniciando registro de usuarios con perfil Telefonista...');
  for (const user of telefonistas) {
    await createOrUpdateUser(user);
  }
  console.log('Finalizado el registro de telefonistas.');
}

run();
