const http = require('http');
const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');

const PORT           = process.env.PORT || 8080;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'goalstore2026';
const DATABASE_URL   = process.env.DATABASE_URL;

const pool = DATABASE_URL ? new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
}) : null;

async function initDB() {
  if (!pool) { console.log('⚠️  DATABASE_URL no configurada — API deshabilitada'); return; }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pedidos (
      id              SERIAL PRIMARY KEY,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      estado          VARCHAR(20)  DEFAULT 'pendiente',
      cliente_nombre  TEXT,
      cliente_email   TEXT,
      cliente_telefono TEXT,
      cliente_direccion TEXT,
      cliente_ciudad  TEXT,
      cliente_cp      TEXT,
      cliente_pais    TEXT,
      subtotal        NUMERIC(10,2),
      envio           NUMERIC(10,2),
      descuento       NUMERIC(10,2),
      total           NUMERIC(10,2),
      metodo_pago     VARCHAR(50),
      items           JSONB,
      notas           TEXT
    )
  `);
  console.log('✅ Tabla pedidos lista');
}
initDB().catch(err => console.error('Error initDB:', err));

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'text/javascript',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch(e) { reject(e); } });
    req.on('error', reject);
  });
}

function checkAuth(req) {
  return req.headers['x-admin-password'] === ADMIN_PASSWORD;
}

function jsonResponse(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function handleApi(req, res) {
  if (!pool) return jsonResponse(res, 503, { error: 'Database not configured' });

  // POST /api/pedido — guardar pedido nuevo (publico)
  if (req.url === '/api/pedido' && req.method === 'POST') {
    const d = await readBody(req);
    const r = await pool.query(
      `INSERT INTO pedidos
       (cliente_nombre, cliente_email, cliente_telefono, cliente_direccion,
        cliente_ciudad, cliente_cp, cliente_pais,
        subtotal, envio, descuento, total, metodo_pago, items, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id, created_at`,
      [d.cliente_nombre, d.cliente_email, d.cliente_telefono, d.cliente_direccion,
       d.cliente_ciudad, d.cliente_cp, d.cliente_pais,
       d.subtotal || 0, d.envio || 0, d.descuento || 0, d.total || 0,
       d.metodo_pago, JSON.stringify(d.items || []), d.notas || null]
    );
    return jsonResponse(res, 200, r.rows[0]);
  }

  // A partir de aqui: requiere autenticación
  if (!checkAuth(req)) return jsonResponse(res, 401, { error: 'Unauthorized' });

  // GET /api/admin/pedidos
  if (req.url.startsWith('/api/admin/pedidos') && req.method === 'GET' && !req.url.match(/\/api\/admin\/pedidos\/\d+/)) {
    const r = await pool.query('SELECT * FROM pedidos ORDER BY created_at DESC LIMIT 500');
    return jsonResponse(res, 200, r.rows);
  }

  // PATCH /api/admin/pedidos/:id (cambiar estado)
  const patchMatch = req.url.match(/^\/api\/admin\/pedidos\/(\d+)$/);
  if (patchMatch && req.method === 'PATCH') {
    const d = await readBody(req);
    const r = await pool.query('UPDATE pedidos SET estado=$1 WHERE id=$2 RETURNING *', [d.estado, patchMatch[1]]);
    return jsonResponse(res, 200, r.rows[0]);
  }

  // DELETE /api/admin/pedidos/:id
  if (patchMatch && req.method === 'DELETE') {
    await pool.query('DELETE FROM pedidos WHERE id=$1', [patchMatch[1]]);
    return jsonResponse(res, 200, { ok: true });
  }

  // GET /api/admin/stats
  if (req.url === '/api/admin/stats' && req.method === 'GET') {
    const mes        = await pool.query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(total),0)::float AS total FROM pedidos WHERE created_at >= NOW() - INTERVAL '30 days'`);
    const pendientes = await pool.query(`SELECT COUNT(*)::int AS n FROM pedidos WHERE estado = 'pendiente'`);
    const todos      = await pool.query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(total),0)::float AS total FROM pedidos`);
    const top        = await pool.query(`
      SELECT item->>'nombre' AS nombre, SUM((item->>'cantidad')::int)::int AS cantidad
      FROM pedidos, jsonb_array_elements(items) AS item
      WHERE items IS NOT NULL
      GROUP BY item->>'nombre'
      ORDER BY cantidad DESC
      LIMIT 5
    `);
    const porDia = await pool.query(`
      SELECT TO_CHAR(DATE(created_at), 'YYYY-MM-DD') AS dia, COUNT(*)::int AS n, COALESCE(SUM(total),0)::float AS total
      FROM pedidos
      WHERE created_at >= NOW() - INTERVAL '14 days'
      GROUP BY dia ORDER BY dia ASC
    `);
    return jsonResponse(res, 200, {
      mes:        mes.rows[0],
      pendientes: pendientes.rows[0],
      todos:      todos.rows[0],
      topProductos: top.rows,
      porDia:     porDia.rows
    });
  }

  return jsonResponse(res, 404, { error: 'Not found' });
}

const server = http.createServer(async (req, res) => {
  // CORS basico
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Rutas API
  if (req.url.startsWith('/api/')) {
    try { await handleApi(req, res); }
    catch(e) { console.error('API error:', e); jsonResponse(res, 500, { error: e.message }); }
    return;
  }

  // Archivos estáticos
  const reqPath = req.url.split('?')[0];
  let filePath = reqPath === '/' || !fs.existsSync(path.join(__dirname, reqPath))
    ? path.join(__dirname, 'index.html')
    : path.join(__dirname, reqPath);

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`GoalStore corriendo en http://0.0.0.0:${PORT}`);
});
