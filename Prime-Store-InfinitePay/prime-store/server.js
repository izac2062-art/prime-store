require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, 'data');
const read = (name) => JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8'));
const write = (name, value) => fs.writeFileSync(path.join(DATA, name), JSON.stringify(value, null, 2));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(session({ secret: process.env.SESSION_SECRET || 'change-this-secret-before-deploy', resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 8 } }));
app.use(express.static(path.join(__dirname, 'public')));
const requireAdmin = (req, res, next) => req.session && req.session.admin ? next() : res.status(401).json({ error: 'Faça login para continuar.' });
app.get('/lojista', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/api/config', (req, res) => res.json({ checkoutReady: !!process.env.INFINITEPAY_HANDLE, storeName: 'Prime Store' }));
app.get('/api/products', (req, res) => res.json(read('products.json').filter(p => p.active !== false)));
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = process.env.ADMIN_USER || 'lojista';
  const pass = process.env.ADMIN_PASSWORD || 'troque-esta-senha';
  if (username !== user || password !== pass) return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  req.session.admin = true;
  res.json({ ok: true });
});
app.post('/api/admin/logout', requireAdmin, (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/admin/me', (req, res) => res.json({ authenticated: !!(req.session && req.session.admin) }));
app.get('/api/admin/products', requireAdmin, (req, res) => res.json(read('products.json')));
app.put('/api/admin/products', requireAdmin, (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Envie uma lista de produtos.' });
  const cleaned = req.body.map(p => ({ id: String(p.id || crypto.randomUUID()), name: String(p.name || '').slice(0, 100), category: String(p.category || 'Unissex').slice(0, 40), price: Number(p.price), oldPrice: Number(p.oldPrice || 0), sizes: Array.isArray(p.sizes) ? p.sizes.map(Number).filter(Number.isFinite) : [], badge: String(p.badge || '').slice(0, 30), image: String(p.image || '').slice(0, 1000), description: String(p.description || '').slice(0, 500), active: p.active !== false }));
  if (cleaned.some(p => !p.name || !Number.isFinite(p.price) || p.price < 0)) return res.status(400).json({ error: 'Confira nomes e preços dos produtos.' });
  write('products.json', cleaned); res.json({ ok: true, products: cleaned });
});
app.get('/api/admin/orders', requireAdmin, (req, res) => res.json(read('orders.json').slice().reverse()));
app.patch('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const orders = read('orders.json'); const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
  const allowed = ['separando', 'enviado', 'concluido', 'cancelado']; if (!allowed.includes(req.body.status)) return res.status(400).json({ error: 'Status inválido.' });
  order.status = req.body.status; write('orders.json', orders); res.json(order);
});
app.post('/api/payments', async (req, res) => {
  try {
    if (!process.env.INFINITEPAY_HANDLE) return res.status(503).json({ error: 'Checkout não configurado. Defina INFINITEPAY_HANDLE no ambiente do servidor.' });
    if (!process.env.BASE_URL || !/^https:\/\//i.test(process.env.BASE_URL)) return res.status(503).json({ error: 'Configure BASE_URL com o endereço HTTPS público da loja.' });
    const d = req.body || {};
    if (!String(d.customerName || '').trim() || !String(d.customerEmail || '').includes('@') || !String(d.customerPhone || '').trim()) return res.status(400).json({ error: 'Preencha nome, e-mail e WhatsApp.' });
    const products = read('products.json'); const cart = Array.isArray(d.cart) ? d.cart : [];
    let verifiedTotal = 0; const items = [];
    for (const line of cart) {
      const product = products.find(x => x.id === line.id && x.active !== false);
      const qty = Math.max(1, Math.min(10, Number(line.quantity) || 1));
      if (!product) return res.status(400).json({ error: 'Um produto do carrinho não está mais disponível.' });
      if (!(product.sizes || []).map(String).includes(String(line.size || ''))) return res.status(400).json({ error: 'Um tamanho selecionado não está disponível.' });
      verifiedTotal += Number(product.price) * qty;
      items.push({ id: product.id, name: product.name, size: String(line.size), quantity: qty, unitPrice: Number(product.price) });
    }
    verifiedTotal = Math.round(verifiedTotal * 100) / 100;
    if (!items.length || verifiedTotal <= 0) return res.status(400).json({ error: 'Seu carrinho está vazio ou possui um valor inválido.' });
    const orderId = 'PS-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    const order = { id: orderId, paymentProvider: 'InfinitePay', paymentStatus: 'aguardando_pagamento', status: 'aguardando_pagamento', createdAt: new Date().toISOString(), customer: { name: String(d.customerName).slice(0,120), email: String(d.customerEmail).slice(0,180), phone: String(d.customerPhone).slice(0,40), address: String(d.address || '').slice(0,500) }, items, total: verifiedTotal };
    const orders = read('orders.json'); orders.push(order); write('orders.json', orders);
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
      const latest = read('orders.json'); const saved = latest.find(o => o.id === orderId); if (saved) { saved.paymentStatus = 'erro_ao_gerar_checkout'; saved.status = 'cancelado'; write('orders.json', latest); }
      return res.status(502).json({ error: 'A InfinitePay não conseguiu gerar o checkout. Confira a InfiniteTag e se o Checkout Integrado está habilitado.' });
    }
    const latest = read('orders.json'); const saved = latest.find(o => o.id === orderId); if (saved) { saved.checkoutUrl = result.url; write('orders.json', latest); }
    res.json({ orderId, checkoutUrl: result.url, message: 'Checkout gerado. Você será direcionado à InfinitePay para concluir o pagamento.' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao iniciar o pagamento. Tente novamente.' }); }
});
app.post('/api/payments/webhook', async (req, res) => {
  try {
    const data = req.body || {}; const orderId = String(data.order_nsu || '');
    if (!orderId) return res.status(400).json({ success: false, message: 'order_nsu ausente' });
    const orders = read('orders.json'); const order = orders.find(o => o.id === orderId);
    if (!order) return res.status(400).json({ success: false, message: 'Pedido não encontrado' });
    // Nunca confiar apenas no retorno do navegador. Confirme a transação pela API oficial.
    if (!data.transaction_nsu || !data.invoice_slug) return res.status(400).json({ success: false, message: 'Dados da transação ausentes' });
    const checkResponse = await fetch('https://api.checkout.infinitepay.io/payment_check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: process.env.INFINITEPAY_HANDLE.replace(/^\$/, ''), order_nsu: orderId, transaction_nsu: data.transaction_nsu, slug: data.invoice_slug }) });
    const check = await checkResponse.json().catch(() => ({}));
    if (!checkResponse.ok || check.success !== true) return res.status(400).json({ success: false, message: 'Não foi possível validar o pagamento' });
    if (check.paid === true && Math.round(Number(check.amount)) === Math.round(order.total * 100)) {
      order.paymentStatus = 'paid'; order.status = order.status === 'aguardando_pagamento' ? 'separando' : order.status;
      order.transactionNsu = data.transaction_nsu; order.invoiceSlug = data.invoice_slug; order.captureMethod = check.capture_method || data.capture_method || ''; order.receiptUrl = data.receipt_url || '';
      write('orders.json', orders);
    } else if (check.paid !== true) { order.paymentStatus = 'pending'; write('orders.json', orders); }
    res.status(200).json({ success: true, message: null });
  } catch (e) { console.error('InfinitePay webhook:', e.message); res.status(500).json({ success: false, message: 'Erro interno' }); }
});
app.get('/pagamento-concluido', (req, res) => res.sendFile(path.join(__dirname, 'public', 'success.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`Prime Store rodando em http://localhost:${PORT}`));
