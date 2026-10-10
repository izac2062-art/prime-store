require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const PgSession = require('connect-pg-simple')(session);
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'disable' ? false : (process.env.DATABASE_URL ? { rejectUnauthorized: false } : false),
  max: isProduction ? 5 : 10,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000
});
let schemaPromise;
function initDb() {
  if (!schemaPromise) schemaPromise = (async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada');
    await pool.query(`CREATE TABLE IF NOT EXISTS store_products (id TEXT PRIMARY KEY, data JSONB NOT NULL)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS store_orders (id TEXT PRIMARY KEY, data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS store_settings (key TEXT PRIMARY KEY, data JSONB NOT NULL)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS store_media (id TEXT PRIMARY KEY, mime_type TEXT NOT NULL, image_data TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await pool.query(`INSERT INTO store_settings(key, data) VALUES ('collection_covers', $1::jsonb) ON CONFLICT(key) DO NOTHING`, [JSON.stringify({heroImage:'', essentials:'', tailoring:'', summer:'', sneakers:'', feature:''})]);
    const count = await pool.query('SELECT COUNT(*)::int AS n FROM store_products');
    if (count.rows[0].n === 0) {
      const seedPath = path.join(__dirname, 'data', 'products.json');
      const seeds = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
      for (const product of seeds) await pool.query('INSERT INTO store_products(id, data) VALUES($1, $2::jsonb) ON CONFLICT(id) DO NOTHING', [String(product.id), JSON.stringify(product)]);
    }
  })().catch(err => { schemaPromise = null; throw err; });
  return schemaPromise;
}

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '6mb' }));
app.use(session({
  store: new PgSession({ pool, tableName: 'user_sessions', createTableIfMissing: true }),
  name: 'prime_store.sid',
  secret: process.env.SESSION_SECRET || (isProduction ? crypto.randomBytes(32).toString('hex') : 'dev-only-change-this-secret'),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: isProduction, maxAge: 1000 * 60 * 60 * 8 }
}));
app.use(express.static(path.join(__dirname, 'public')));
app.use(async (req, res, next) => {
  try { await initDb(); next(); }
  catch (err) {
    console.error('Database initialization failed:', err.message);
    res.status(503).json({ error: 'Banco de dados indisponível. Configure DATABASE_URL na Vercel.' });
  }
});

const requireAdmin = (req, res, next) => req.session && req.session.admin ? next() : res.status(401).json({ error: 'Faça login para continuar.' });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' } });
const getProducts = async (includeInactive = true) => {
  const result = await pool.query('SELECT data FROM store_products ORDER BY data->>\'name\' ASC');
  const products = result.rows.map(r => r.data);
  return includeInactive ? products : products.filter(p => p.active !== false);
};
const saveProducts = async products => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM store_products');
    for (const p of products) await client.query('INSERT INTO store_products(id, data) VALUES($1, $2::jsonb)', [String(p.id), JSON.stringify(p)]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
};
const getOrders = async () => {
  const result = await pool.query('SELECT data FROM store_orders ORDER BY created_at DESC');
  return result.rows.map(r => r.data);
};
const getOrder = async id => {
  const result = await pool.query('SELECT data FROM store_orders WHERE id=$1', [id]);
  return result.rows[0]?.data || null;
};
const saveOrder = async order => {
  await pool.query('INSERT INTO store_orders(id, data, created_at) VALUES($1, $2::jsonb, $3) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data', [order.id, JSON.stringify(order), order.createdAt]);
};

app.get('/api/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true, database: 'connected', store: 'Prime Store' }); }
  catch { res.status(503).json({ ok: false, database: 'disconnected' }); }
});
app.get('/lojista', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.post('/api/admin/media', requireAdmin, async (req, res) => {
  const mime = String(req.body?.mimeType || '');
  const dataUrl = String(req.body?.dataUrl || '');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) return res.status(400).json({ error: 'Formato não permitido. Use JPG, PNG ou WebP.' });
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match || match[1] !== mime) return res.status(400).json({ error: 'Arquivo de imagem inválido.' });
  if (match[2].length > 2600000) return res.status(413).json({ error: 'Imagem muito grande. Tente uma foto menor.' });
  const id = crypto.randomUUID();
  await pool.query('INSERT INTO store_media(id, mime_type, image_data) VALUES($1,$2,$3)', [id, mime, match[2]]);
  res.json({ ok: true, url: '/media/' + id });
});
app.get('/media/:id', async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).end();
  const result = await pool.query('SELECT mime_type, image_data FROM store_media WHERE id=$1', [req.params.id]);
  if (!result.rows.length) return res.status(404).end();
  res.set('Content-Type', result.rows[0].mime_type);
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(Buffer.from(result.rows[0].image_data, 'base64'));
});
app.get('/api/config', async (req, res) => { const r = await pool.query('SELECT data FROM store_settings WHERE key=$1', ['collection_covers']); res.json({ checkoutReady: Boolean(process.env.INFINITEPAY_HANDLE && process.env.BASE_URL && process.env.SESSION_SECRET && process.env.DATABASE_URL), storeName: 'Prime Store', collectionCovers: r.rows[0]?.data || {} }); });
app.get('/api/admin/collection-covers', requireAdmin, async (req, res) => { const r = await pool.query('SELECT data FROM store_settings WHERE key=$1', ['collection_covers']); res.json(r.rows[0]?.data || {}); });
app.put('/api/admin/collection-covers', requireAdmin, async (req, res) => {
  const allowed = ['heroImage','essentials','tailoring','summer','sneakers','feature']; const incoming = req.body || {}; const clean = {};
  for (const key of allowed) { const value = String(incoming[key] || ''); if (value.length > 4500000) return res.status(400).json({error:'Imagem muito grande. Use uma imagem menor.'}); if (value && !(/^(https:\/\/|data:image\/(jpeg|png|webp);base64,)/i.test(value) || /^\/media\/[0-9a-f-]{36}$/i.test(value))) return res.status(400).json({error:'Use URL HTTPS ou envie uma imagem válida.'}); clean[key] = value; }
  await pool.query('INSERT INTO store_settings(key,data) VALUES($1,$2::jsonb) ON CONFLICT(key) DO UPDATE SET data=EXCLUDED.data', ['collection_covers', JSON.stringify(clean)]); res.json({ok:true,collectionCovers:clean});
});
app.get('/api/products', async (req, res) => res.json(await getProducts(false)));
app.post('/api/admin/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASSWORD;
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32 || !user || !pass || user === 'lojista' || pass.length < 12) return res.status(503).json({ error: 'Configure SESSION_SECRET (mínimo 32 caracteres), ADMIN_USER e ADMIN_PASSWORD forte (mínimo de 12 caracteres) na Vercel.' });
  const usernameOK = String(username || '') === user;
  const provided = Buffer.from(String(password || ''));
  const expected = Buffer.from(pass);
  const passwordOK = provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
  if (!usernameOK || !passwordOK) return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Não foi possível iniciar a sessão.' });
    req.session.admin = true;
    req.session.save(saveErr => saveErr ? res.status(500).json({ error: 'Não foi possível salvar a sessão.' }) : res.json({ ok: true }));
  });
});
app.post('/api/admin/logout', requireAdmin, (req, res) => req.session.destroy(() => { res.clearCookie('prime_store.sid'); res.json({ ok: true }); }));
app.get('/api/admin/me', (req, res) => res.json({ authenticated: !!(req.session && req.session.admin) }));
app.get('/api/admin/products', requireAdmin, async (req, res) => res.json(await getProducts(true)));
app.put('/api/admin/products', requireAdmin, async (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Envie uma lista de produtos.' });
  const cleaned = req.body.map(p => ({ id: String(p.id || crypto.randomUUID()).slice(0,100), name: String(p.name || '').trim().slice(0,100), category: String(p.category || 'Unissex').slice(0,40), price: Number(p.price), oldPrice: Number(p.oldPrice || 0), sizes: Array.isArray(p.sizes) ? p.sizes.map(s => String(s).trim().slice(0,12)).filter(s => s && s.length > 0) : [], badge: String(p.badge || '').slice(0,30), image: String(p.image || '').slice(0,2000), description: String(p.description || '').slice(0,500), active: p.active !== false }));
  if (cleaned.some(p => !p.name || !Number.isFinite(p.price) || p.price <= 0 || !p.sizes.length || (p.image && !(/^https:\/\//i.test(p.image) || /^\/media\/[0-9a-f-]{36}$/i.test(p.image))))) return res.status(400).json({ error: 'Confira nomes, preços maiores que zero e tamanhos dos produtos.' });
  if (new Set(cleaned.map(p => p.id)).size !== cleaned.length) return res.status(400).json({ error: 'Existem produtos com IDs duplicados.' });
  await saveProducts(cleaned); res.json({ ok: true, products: cleaned });
});
app.get('/api/admin/orders', requireAdmin, async (req, res) => res.json(await getOrders()));
app.patch('/api/admin/orders/:id', requireAdmin, async (req, res) => {
  const order = await getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
  const allowed = ['separando', 'enviado', 'concluido', 'cancelado'];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: 'Status inválido.' });
  if (order.paymentStatus !== 'paid' && ['separando', 'enviado', 'concluido'].includes(req.body.status)) return res.status(409).json({ error: 'O pedido só pode avançar após a confirmação do pagamento.' });
  order.status = req.body.status; await saveOrder(order); res.json(order);
});

app.post('/api/payments', async (req, res) => {
  try {
    if (!process.env.INFINITEPAY_HANDLE) return res.status(503).json({ error: 'Configure INFINITEPAY_HANDLE nas variáveis de ambiente da Vercel.' });
    if (!process.env.BASE_URL || !/^https:\/\//i.test(process.env.BASE_URL)) return res.status(503).json({ error: 'Configure BASE_URL com o endereço HTTPS público da loja.' });
    const d = req.body || {};
    if (!String(d.customerName || '').trim() || !String(d.customerEmail || '').includes('@') || !String(d.customerPhone || '').trim()) return res.status(400).json({ error: 'Preencha nome, e-mail e WhatsApp.' });
    const products = await getProducts(false); const cart = Array.isArray(d.cart) ? d.cart : [];
    let verifiedTotal = 0; const items = [];
    for (const line of cart) {
      const product = products.find(x => x.id === line.id);
      const qty = Math.max(1, Math.min(10, Math.floor(Number(line.quantity) || 1)));
      if (!product) return res.status(400).json({ error: 'Um produto do carrinho não está mais disponível.' });
      if (!(product.sizes || []).map(String).includes(String(line.size || ''))) return res.status(400).json({ error: 'Um tamanho selecionado não está disponível.' });
      verifiedTotal += Number(product.price) * qty;
      items.push({ id: product.id, name: product.name, size: String(line.size), quantity: qty, unitPrice: Number(product.price) });
    }
    verifiedTotal = Math.round(verifiedTotal * 100) / 100;
    if (!items.length || verifiedTotal <= 0) return res.status(400).json({ error: 'Seu carrinho está vazio ou possui um valor inválido.' });
    const orderId = 'PS-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    const order = { id: orderId, paymentProvider: 'InfinitePay', paymentStatus: 'aguardando_pagamento', status: 'aguardando_pagamento', createdAt: new Date().toISOString(), customer: { name: String(d.customerName).trim().slice(0,120), email: String(d.customerEmail).trim().slice(0,180), phone: String(d.customerPhone).trim().slice(0,40), address: String(d.address || '').trim().slice(0,500) }, items, total: verifiedTotal };
    await saveOrder(order);
    const payload = {
      handle: process.env.INFINITEPAY_HANDLE.replace(/^\$/, ''),
      redirect_url: process.env.BASE_URL.replace(/\/$/, '') + '/pagamento-concluido',
      webhook_url: process.env.BASE_URL.replace(/\/$/, '') + '/api/payments/webhook',
      order_nsu: orderId,
      customer: { name: order.customer.name, email: order.customer.email, phone_number: order.customer.phone },
      items: items.map(item => ({ quantity: item.quantity, price: Math.round(item.unitPrice * 100), description: `${item.name} — tamanho ${item.size}` }))
    };
    if (order.customer.address) {
      const cep = order.customer.address.match(/\b\d{5}-?\d{3}\b/);
      if (cep) payload.address = { cep: cep[0].replace('-', ''), number: 'S/N', complement: order.customer.address.slice(0,100) };
    }
    const response = await fetch('https://api.checkout.infinitepay.io/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.url || !/^https:\/\/checkout\.infinitepay\.com\.br\//i.test(result.url)) {
      order.paymentStatus = 'erro_ao_gerar_checkout'; order.status = 'cancelado'; await saveOrder(order);
      console.error('InfinitePay link error:', response.status, JSON.stringify(result).slice(0,500));
      return res.status(502).json({ error: 'A InfinitePay não conseguiu gerar o checkout. Confira a InfiniteTag e se o Checkout Integrado está habilitado.' });
    }
    order.checkoutUrl = result.url; await saveOrder(order);
    res.json({ orderId, checkoutUrl: result.url, message: 'Checkout gerado. Você será direcionado à InfinitePay para concluir o pagamento.' });
  } catch (e) { console.error('Create payment error:', e.message); res.status(500).json({ error: 'Erro ao iniciar o pagamento. Tente novamente.' }); }
});

app.post('/api/payments/webhook', async (req, res) => {
  try {
    const data = req.body || {}; const orderId = String(data.order_nsu || '');
    if (!orderId) return res.status(400).json({ success: false, message: 'order_nsu ausente' });
    const order = await getOrder(orderId);
    if (!order) return res.status(400).json({ success: false, message: 'Pedido não encontrado' });
    if (order.paymentStatus === 'paid') return res.status(200).json({ success: true, message: null });
    if (!data.transaction_nsu || !data.invoice_slug) return res.status(400).json({ success: false, message: 'Dados da transação ausentes' });
    const checkResponse = await fetch('https://api.checkout.infinitepay.io/payment_check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: process.env.INFINITEPAY_HANDLE.replace(/^\$/, ''), order_nsu: orderId, transaction_nsu: data.transaction_nsu, slug: data.invoice_slug }) });
    const check = await checkResponse.json().catch(() => ({}));
    if (!checkResponse.ok || check.success !== true) return res.status(400).json({ success: false, message: 'Não foi possível validar o pagamento' });
    if (check.paid === true && Math.round(Number(check.amount)) === Math.round(order.total * 100)) {
      order.paymentStatus = 'paid'; order.status = order.status === 'aguardando_pagamento' ? 'separando' : order.status;
      order.transactionNsu = String(data.transaction_nsu); order.invoiceSlug = String(data.invoice_slug); order.captureMethod = check.capture_method || data.capture_method || ''; order.receiptUrl = data.receipt_url || '';
      await saveOrder(order);
    } else if (check.paid !== true) { order.paymentStatus = 'pending'; await saveOrder(order); }
    res.status(200).json({ success: true, message: null });
  } catch (e) { console.error('InfinitePay webhook:', e.message); res.status(500).json({ success: false, message: 'Erro interno' }); }
});
app.get('/pagamento-concluido', (req, res) => res.sendFile(path.join(__dirname, 'public', 'success.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Prime Store rodando em http://localhost:${PORT}`));
}
module.exports = app;
