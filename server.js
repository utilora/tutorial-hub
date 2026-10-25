const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
const USERS_FILE = path.join(DATA, 'users.json');
const TUTORIALS_FILE = path.join(DATA, 'tutorials.json');
const sessions = new Map();

fs.mkdirSync(DATA, { recursive: true });
if (!fs.existsSync(TUTORIALS_FILE)) fs.copyFileSync(path.join(ROOT, 'data', 'tutorials.example.json'), TUTORIALS_FILE);
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2));
const hash = password => crypto.scryptSync(password, 'tutorial-hub-salt', 64).toString('hex');
function safe(value) { return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function parseCookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(x => x.trim().split('=').map(decodeURIComponent))); }
function currentUser(req) { const id = parseCookies(req).sid; return id && sessions.get(id); }
function send(res, status, body, type = 'text/html; charset=utf-8') { res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' }); res.end(body); }
function redirect(res, url) { res.writeHead(303, { Location: url }); res.end(); }
function form(req) { return new Promise(resolve => { let body = ''; req.on('data', c => body += c); req.on('end', () => resolve(Object.fromEntries(new URLSearchParams(body)))); }); }

function ensureAdmin() {
  const users = read(USERS_FILE);
  if (users.some(u => u.role === 'admin')) return;
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url');
  users.push({ id: crypto.randomUUID(), email: (process.env.ADMIN_EMAIL || 'admin@local.test').toLowerCase(), password: hash(password), role: 'admin', favorites: [] });
  write(USERS_FILE, users);
  console.log(`Admin: ${process.env.ADMIN_EMAIL || 'admin@local.test'} / ${password}`);
}
ensureAdmin();

function layout(title, content, user) {
  const account = user ? `<span class="account">${safe(user.email)}</span><a href="/favorites">收藏</a>${user.role === 'admin' ? '<a href="/admin">管理</a>' : ''}<form action="/logout" method="post"><button class="link">退出</button></form>` : '<a href="/login">登录</a><a class="button small" href="/register">注册</a>';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safe(title)} · Tutorial Hub</title><link rel="stylesheet" href="/style.css"></head><body><header><a class="brand" href="/">Tutorial Hub</a><nav>${account}</nav></header><main>${content}</main><footer>教程导航与推广信息均独立审核。第三方价格、步骤与政策可能变化；本站与第三方服务无官方关联，除非另有明确说明。</footer></body></html>`;
}
function tutorialCard(t, user) {
  const favorited = user?.favorites?.includes(t.id);
  return `<article class="card"><div class="meta"><span>${safe(t.category)}</span>${t.isPromotion ? '<b>推广链接 / 合作链接</b>' : ''}</div><h2>${safe(t.title)}</h2><p>${safe(t.summary)}</p><div class="card-actions"><a class="button" href="/go/${encodeURIComponent(t.id)}" target="_blank" rel="noopener noreferrer">查看教程 ↗</a>${user ? `<form action="/favorite/${encodeURIComponent(t.id)}" method="post"><button class="ghost">${favorited ? '已收藏' : '收藏'}</button></form>` : ''}</div></article>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`); const user = currentUser(req); const tutorials = () => read(TUTORIALS_FILE);
  if (req.method === 'GET' && url.pathname === '/style.css') return send(res, 200, fs.readFileSync(path.join(ROOT, 'style.css')), 'text/css; charset=utf-8');
  if (req.method === 'GET' && url.pathname === '/') {
    const q = url.searchParams.get('q') || ''; const category = url.searchParams.get('category') || '';
    const all = tutorials().filter(t => t.status === 'published'); const cats = [...new Set(all.map(t => t.category))];
    const rows = all.filter(t => (!category || t.category === category) && (`${t.title} ${t.summary} ${t.category}`).toLowerCase().includes(q.toLowerCase()));
    const filters = `<form class="search" method="get"><input name="q" value="${safe(q)}" placeholder="搜索教程、工具或主题"><select name="category"><option value="">全部分类</option>${cats.map(c => `<option ${c === category ? 'selected' : ''}>${safe(c)}</option>`).join('')}</select><button>筛选</button></form>`;
    return send(res, 200, layout('教程导航', `<section class="hero"><p class="eyebrow">清晰、透明、值得收藏</p><h1>把有用的教程，放在一个好找的地方。</h1><p>发现学习资源，保存稍后阅读；任何合作内容都会明确标识。</p>${filters}</section><section class="grid">${rows.length ? rows.map(t => tutorialCard(t, user)).join('') : '<p>没有匹配的教程。</p>'}</section>`, user));
  }
  if (req.method === 'GET' && url.pathname === '/register') return send(res, 200, layout('注册', `<section class="auth"><h1>创建账号</h1><form method="post"><label>邮箱<input required name="email" type="email"></label><label>密码<input required name="password" type="password" minlength="8"></label><button>注册</button></form><p>已有账号？<a href="/login">登录</a></p></section>`, user));
  if (req.method === 'POST' && url.pathname === '/register') { const b = await form(req), users = read(USERS_FILE), email = String(b.email || '').trim().toLowerCase(); if (!email || String(b.password).length < 8 || users.some(u => u.email === email)) return send(res, 400, layout('注册失败', '<p>邮箱已存在或密码不足 8 位。</p><p><a href="/register">返回</a></p>', user)); const u = { id: crypto.randomUUID(), email, password: hash(b.password), role: 'user', favorites: [] }; users.push(u); write(USERS_FILE, users); const sid = crypto.randomBytes(24).toString('hex'); sessions.set(sid, u); res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; SameSite=Lax; Path=/`); return redirect(res, '/'); }
  if (req.method === 'GET' && url.pathname === '/login') return send(res, 200, layout('登录', `<section class="auth"><h1>欢迎回来</h1><form method="post"><label>邮箱<input required name="email" type="email"></label><label>密码<input required name="password" type="password"></label><button>登录</button></form><p>还没有账号？<a href="/register">注册</a></p></section>`, user));
  if (req.method === 'POST' && url.pathname === '/login') { const b = await form(req), u = read(USERS_FILE).find(x => x.email === String(b.email || '').trim().toLowerCase() && x.password === hash(b.password || '')); if (!u) return send(res, 401, layout('登录失败', '<p>邮箱或密码不正确。</p><p><a href="/login">重试</a></p>', user)); const sid = crypto.randomBytes(24).toString('hex'); sessions.set(sid, u); res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; SameSite=Lax; Path=/`); return redirect(res, '/'); }
  if (req.method === 'POST' && url.pathname === '/logout') { sessions.delete(parseCookies(req).sid); res.setHeader('Set-Cookie', 'sid=; Max-Age=0; Path=/'); return redirect(res, '/'); }
  if (req.method === 'POST' && url.pathname.startsWith('/favorite/')) { if (!user) return redirect(res, '/login'); const id = decodeURIComponent(url.pathname.slice(10)); const users = read(USERS_FILE), u = users.find(x => x.id === user.id); u.favorites = u.favorites || []; u.favorites = u.favorites.includes(id) ? u.favorites.filter(x => x !== id) : [...u.favorites, id]; write(USERS_FILE, users); sessions.forEach((v, k) => { if (v.id === u.id) sessions.set(k, u); }); return redirect(res, req.headers.referer || '/'); }
  if (req.method === 'GET' && url.pathname === '/favorites') { if (!user) return redirect(res, '/login'); return send(res, 200, layout('我的收藏', `<h1>我的收藏</h1><section class="grid">${tutorials().filter(t => user.favorites?.includes(t.id)).map(t => tutorialCard(t, user)).join('') || '<p>还没有收藏。去首页发现教程吧。</p>'}</section>`, user)); }
  if (req.method === 'GET' && url.pathname.startsWith('/go/')) { const id = decodeURIComponent(url.pathname.slice(4)), all = tutorials(), t = all.find(x => x.id === id && x.status === 'published'); if (!t) return send(res, 404, 'Not found'); t.clicks = Number(t.clicks || 0) + 1; write(TUTORIALS_FILE, all); return redirect(res, t.url); }
  if (!user || user.role !== 'admin') return send(res, 404, layout('页面不存在', '<p>未找到该页面。</p>', user));
  if (req.method === 'GET' && url.pathname === '/admin') { const rows = tutorials().map(t => `<tr><td>${safe(t.title)}</td><td>${safe(t.category)}</td><td>${t.isPromotion ? '推广' : '普通'}</td><td>${safe(t.status)}</td><td>${t.clicks || 0}</td></tr>`).join(''); return send(res, 200, layout('管理后台', `<div class="admin-head"><div><h1>教程管理</h1><p>推广链接必须如实标识，发布前请审核内容合法性。</p></div><a class="button" href="/admin/new">新增教程</a></div><table><thead><tr><th>标题</th><th>分类</th><th>属性</th><th>状态</th><th>点击</th></tr></thead><tbody>${rows}</tbody></table>`, user)); }
  if (req.method === 'GET' && url.pathname === '/admin/new') return send(res, 200, layout('新增教程', `<section class="auth wide"><h1>新增教程</h1><form method="post"><label>标题<input required name="title"></label><label>分类<input required name="category"></label><label>摘要<textarea required name="summary"></textarea></label><label>外链 URL<input required name="url" type="url"></label><label>状态<select name="status"><option value="draft">草稿</option><option value="published">发布</option></select></label><label class="check"><input name="isPromotion" type="checkbox"> 这是推广链接 / 合作链接</label><button>保存</button></form></section>`, user));
  if (req.method === 'POST' && url.pathname === '/admin/new') { const b = await form(req); try { new URL(b.url); } catch { return send(res, 400, layout('保存失败', '<p>请输入有效的外链 URL。</p>', user)); } const all = tutorials(); all.push({ id: crypto.randomUUID(), title: b.title, category: b.category, summary: b.summary, url: b.url, isPromotion: b.isPromotion === 'on', status: b.status === 'published' ? 'published' : 'draft', clicks: 0 }); write(TUTORIALS_FILE, all); return redirect(res, '/admin'); }
  return send(res, 404, 'Not found');
});
server.listen(PORT, () => console.log(`Tutorial Hub running at http://localhost:${PORT}`));
