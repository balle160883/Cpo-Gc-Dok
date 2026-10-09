const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:Seguridad2028%40@31.97.144.6:5435/postgres',
  connectionTimeoutMillis: 10000
});

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
    email: 'asesortelefonico@cajaobatos.com.mx',
    password_hash: 'Oblatos2026!Kg#5',
    rol: 'telefonista',
    gestor: 'KENIA ALEJANDRA GARCIA ANGEL'
  },
  {
    email: 'asesortelefonico@cajaoblatos.com.mx',
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

async function run() {
  try {
    const cols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'usuarios_gestor'");
    console.log('Columns in usuarios_gestor:', cols.rows);

    for (const t of telefonistas) {
      const existing = await pool.query('SELECT id FROM usuarios_gestor WHERE email = $1', [t.email]);
      if (existing.rows.length > 0) {
        await pool.query(
          'UPDATE usuarios_gestor SET password_hash = $1, rol = $2, gestor = $3 WHERE id = $4',
          [t.password_hash, t.rol, t.gestor, existing.rows[0].id]
        );
        console.log('✓ Actualizado en Dokploy PG:', t.email);
      } else {
        await pool.query(
          'INSERT INTO usuarios_gestor (email, password_hash, rol, gestor) VALUES ($1, $2, $3, $4)',
          [t.email, t.password_hash, t.rol, t.gestor]
        );
        console.log('✓ Insertado en Dokploy PG:', t.email);
      }
    }
    console.log('✅ Todos los telefonistas sincronizados correctamente en Dokploy PostgreSQL.');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

run();
