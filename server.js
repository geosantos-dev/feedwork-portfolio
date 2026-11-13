'use strict';
/**
 * FeedWork — servidor (Node.js + SQLite), sem dependências externas.
 * Rode com:  node server.js   (precisa de Node 22.13 ou mais novo)
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, tx, DB_PATH, adminCriado } = require('./db');
const senha = require('./senha');
const cnpjLib = require('./cnpj');

/* ===== Configuração (variáveis de ambiente) ===== */
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';          // use HOST=0.0.0.0 para hospedar
const COOKIE_SECURE = process.env.COOKIE_SECURE === '1'; // use 1 quando o site estiver em HTTPS
const TRUST_PROXY = process.env.TRUST_PROXY === '1';        // use 1 atrás de túnel/hospedagem (ngrok, Render...)
const MODERAR_EMPRESAS = process.env.MODERAR_EMPRESAS !== '0';     // 0 = publica direto
const MODERAR_AVALIACOES = process.env.MODERAR_AVALIACOES !== '0'; // 0 = publica direto
const SESSAO_MS = 7 * 24 * 60 * 60 * 1000;
const TERMOS_VERSION = 'draft-2026-11-v1';
const MARKETING_VERSION = 'marketing-email-v1';
const PUB = path.join(__dirname, 'public');

/* ===== Utilitários ===== */
class HttpError extends Error {
  constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; }
}
const bad = (m, extra) => new HttpError(400, m, extra);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const norm = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function str(v, campo, { min = 0, max = 200, multi = false } = {}) {
  if (v !== undefined && v !== null && typeof v !== 'string') throw bad(`Campo inválido: ${campo}.`);
  let s = (v ?? '').trim();
  if (!multi) s = s.replace(/\s+/g, ' ');
  if (s.length < min) throw bad(min <= 1 ? `Preencha o campo "${campo}".` : `"${campo}" deve ter pelo menos ${min} caracteres.`);
  if (s.length > max) throw bad(`"${campo}" deve ter no máximo ${max} caracteres.`);
  return s;
}
function opcao(v, campo, lista) {
  if (!lista.includes(v)) throw bad(`Valor inválido em "${campo}".`);
  return v;
}
function senhaValida(v, campo = 'Senha') {
  if (typeof v !== 'string' || v.length < 12) throw bad(`${campo} deve ter pelo menos 12 caracteres.`);
  if (v.length > 200) throw bad(`${campo} muito longa.`);
  return v;
}
const pub = (u) => {
  const consentimento = db.prepare(`SELECT aceito FROM consent_records
                                    WHERE user_id = ? AND tipo = 'marketing_email'
                                    ORDER BY id DESC LIMIT 1`).get(u.id);
  return { id: u.id, nome: u.nome, email: u.email, role: u.role, marketingConsent: consentimento?.aceito === 1 };
};

/* ===== Filtro de palavras (lista editável no painel do administrador; lógica em filtro.js) ===== */
const filtroLib = require('./filtro');
let FILTRO = filtroLib.criar([]);
function carregarFiltro() {
  FILTRO = filtroLib.criar(db.prepare('SELECT palavra FROM palavras').all().map((r) => r.palavra));
}
function filtrar(ctx, campos) {
  if (ctx.user && ctx.user.role === 'admin') return;   // administradores não são filtrados
  for (const [valor, rotulo] of campos) {
    const achado = FILTRO.achar(valor);
    if (achado) throw bad(`O campo "${rotulo}" contém uma palavra não permitida ("${achado}"). Reescreva sem ela.`);
  }
}
carregarFiltro();
const categoriasDe = (setor) => String(setor).split('/').map((x) => x.trim()).filter(Boolean);

/* ===== Limite de tentativas (persistente no SQLite) ===== */
function limitar(ctx, chave, max, janelaMs) {
  const agora = Date.now();
  const aceita = db.prepare(`
    INSERT INTO rate_limit_events (chave, ip, criado_em)
    SELECT ?, ?, ?
    WHERE (SELECT COUNT(*) FROM rate_limit_events WHERE chave = ? AND ip = ? AND criado_em > ?) < ?
    RETURNING id
  `).get(chave, ctx.ip, agora, chave, ctx.ip, agora - janelaMs, max);
  if (!aceita) throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos e tente de novo.');
}
function limparLimitesAntigos() {
  db.prepare('DELETE FROM rate_limit_events WHERE criado_em < ?').run(Date.now() - 24 * 60 * 60 * 1000);
}
limparLimitesAntigos();
setInterval(limparLimitesAntigos, 60 * 60 * 1000).unref();

/* ===== Sessões (cookie httpOnly + token guardado como hash no banco) ===== */
function lerCookie(req, nome) {
  for (const p of (req.headers.cookie || '').split(';')) {
    const i = p.indexOf('=');
    if (i > 0 && p.slice(0, i).trim() === nome) {
      try { return decodeURIComponent(p.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}
function setCookie(res, valor, maxAgeSeg) {
  res.setHeader('Set-Cookie', `fw_sess=${valor}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeg}${COOKIE_SECURE ? '; Secure' : ''}`);
}
function criarSessao(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token_hash, user_id, expira_em) VALUES (?,?,?)').run(sha(token), userId, Date.now() + SESSAO_MS);
  setCookie(res, token, SESSAO_MS / 1000);
}
function usuarioDaReq(req) {
  const t = lerCookie(req, 'fw_sess');
  if (!t) return null;
  const u = db.prepare(`SELECT u.id, u.nome, u.email, u.role, u.bloqueado FROM sessions s
                        JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expira_em > ?`).get(sha(t), Date.now());
  return u && !u.bloqueado ? u : null;
}
function limparSessoesExpiradas() { db.prepare('DELETE FROM sessions WHERE expira_em < ?').run(Date.now()); }
limparSessoesExpiradas();
setInterval(limparSessoesExpiradas, 60 * 60 * 1000).unref();

/* ===== Roteador mínimo ===== */
const rotas = [];
function rota(metodo, padrao, nivel, fn) {
  const re = new RegExp('^' + padrao.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$');
  rotas.push({ metodo, re, nivel, fn });
}

function enviarJson(res, status, obj) {
  const corpo = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(corpo) });
  res.end(corpo);
}

function lerBody(req, limite = 100 * 1024) {
  return new Promise((ok, falha) => {
    let tam = 0, estourou = false;
    const partes = [];
    req.on('data', (c) => {
      if (estourou) return;
      tam += c.length;
      if (tam > limite) { estourou = true; falha(new HttpError(413, 'Requisição muito grande.')); return; }
      partes.push(c);
    });
    req.on('end', () => {
      if (estourou) return;
      if (!partes.length) return ok({});
      try {
        const j = JSON.parse(Buffer.concat(partes).toString('utf8'));
        ok(j && typeof j === 'object' && !Array.isArray(j) ? j : {});
      } catch { falha(bad('JSON inválido.')); }
    });
    req.on('error', falha);
  });
}

async function tratarApi(req, res, url) {
  const metodo = req.method;
  let ip = req.socket.remoteAddress || '?';
  if (TRUST_PROXY) {   // atrás de um proxy, o IP real do visitante vem no último item de X-Forwarded-For
    const xf = String(req.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (xf.length) ip = xf[xf.length - 1];
  }
  try {
    const muda = !['GET', 'HEAD'].includes(metodo);
    if (muda) {
      // Proteção contra CSRF: só aceitamos JSON e, se houver Origin, ele precisa ser deste mesmo site.
      if (!/^application\/json/i.test(req.headers['content-type'] || '')) throw new HttpError(415, 'Content-Type deve ser application/json.');
      const origin = req.headers.origin;
      if (origin) {
        let host = null;
        try { host = new URL(origin).host; } catch { /* ignora */ }
        if (host !== req.headers.host) throw new HttpError(403, 'Origem não permitida.');
      }
    }
    const r = rotas.find((x) => x.metodo === metodo && x.re.test(url.pathname));
    if (!r) throw new HttpError(404, 'Rota não encontrada.');
    const params = {};
    for (const [k, v] of Object.entries(r.re.exec(url.pathname).groups || {})) {
      try { params[k] = decodeURIComponent(v); } catch { throw bad('Endereço inválido.'); }
    }
    const user = usuarioDaReq(req);
    if (r.nivel !== 'publico' && !user) throw new HttpError(401, 'Entre na sua conta para continuar.');
    if (r.nivel === 'admin' && user.role !== 'admin') throw new HttpError(403, 'Acesso restrito a administradores.');
    const body = muda ? await lerBody(req) : {};
    const ctx = { req, res, params, query: url.searchParams, body, user, ip, status: 200 };
    const resultado = await r.fn(ctx);
    if (!res.headersSent) enviarJson(res, ctx.status, resultado ?? { ok: true });
  } catch (e) {
    if (e instanceof HttpError) {
      if (e.status === 413) res.setHeader('Connection', 'close');
      return enviarJson(res, e.status, { erro: e.message, ...(e.extra || {}) });
    }
    console.error('[erro]', e);
    enviarJson(res, 500, { erro: 'Erro interno do servidor.' });
  }
}

/* ===== Arquivos estáticos (pasta public/) ===== */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};
function estatico(req, res, pathname) {
  const naoEncontrado = () => { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Página não encontrada.'); };
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
  let p;
  try { p = decodeURIComponent(pathname); } catch { return naoEncontrado(); }
  if (p.includes('\0') || p.split('/').some((seg) => seg.startsWith('.'))) return naoEncontrado();
  if (p.endsWith('/')) p += 'index.html';
  const arquivo = path.normalize(path.join(PUB, p));
  if (!arquivo.startsWith(PUB + path.sep)) return naoEncontrado();
  fs.stat(arquivo, (err, st) => {
    if (err || !st.isFile()) return naoEncontrado();
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(arquivo).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(arquivo).on('error', () => res.destroy()).pipe(res);
  });
}

/* ================================================================
   REGRAS DE NEGÓCIO
   ================================================================ */
const PORTES = ['1 a 50', '51 a 200', '201 a 1.000', '1.001 a 5.000', '+5.000'];
const SETORES = ['Tecnologia', 'Finanças', 'Varejo', 'Saúde', 'Educação', 'Indústria', 'Serviços', 'Outro'];
const PLANOS = ['Painel de Insights', 'Selo de Transparência', 'Resposta e Atração'];
const ASSUNTOS = ['Dúvida', 'Sugestão', 'Problema no site', 'Denúncia', 'Elogio', 'Outro'];

/* ----- Estatísticas de empresas ----- */
function mapaNotas() {
  const m = {};
  const linhas = db.prepare(`SELECT company_id, COUNT(*) n, SUM(n1) s1, SUM(n2) s2, SUM(n3) s3, SUM(n4) s4
                             FROM reviews WHERE status = 'aprovada' GROUP BY company_id`).all();
  for (const l of linhas) m[l.company_id] = l;
  return m;
}
function empresaOut(c, m) {
  const r = m[c.id];
  const n = c.n0 + (r ? r.n : 0);
  const base = JSON.parse(c.base);
  const cats = [0, 1, 2, 3].map((i) => (n ? (base[i] * c.n0 + (r ? r['s' + (i + 1)] : 0)) / n : 0));
  return {
    id: c.id, nome: c.nome, setor: c.setor, sede: c.sede, porte: c.porte, tag: c.tag,
    desc: c.descricao, status: c.status, n, cats, nota: cats.reduce((a, b) => a + b, 0) / 4,
  };
}
function visibilidade(u) {
  if (!u) return { sql: "status = 'aprovada'", p: [] };
  if (u.role === 'admin') return { sql: '1 = 1', p: [] };
  return { sql: "(status = 'aprovada' OR criado_por = ?)", p: [u.id] };
}
function slug(nome) {
  return norm(nome).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'empresa-' + Date.now();
}

/* ----- Autenticação ----- */
rota('POST', '/api/auth/registrar', 'publico', (ctx) => {
  limitar(ctx, 'registrar', 10, 60 * 60 * 1000);
  const { body } = ctx;
  if (body.aceitouTermos !== true) throw bad('Você precisa aceitar os Termos de Uso para criar a conta.');
  if (body.consentimentoMarketing !== undefined && typeof body.consentimentoMarketing !== 'boolean') throw bad('Preferência de marketing inválida.');
  const consentimentoMarketing = body.consentimentoMarketing === true;
  const nome = str(body.nome, 'Nome', { min: 2, max: 60 });
  filtrar(ctx, [[nome, 'Nome']]);
  const email = str(body.email, 'E-mail', { min: 5, max: 120 }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw bad('E-mail inválido.');
  const pass = senhaValida(body.senha);
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'Este e-mail já está cadastrado.');
  const id = Number(tx(() => {
    const userId = Number(db.prepare('INSERT INTO users (nome, email, senha_hash) VALUES (?,?,?)').run(nome, email, senha.hash(pass)).lastInsertRowid);
    const gravarConsentimento = db.prepare('INSERT INTO consent_records (user_id, tipo, versao, aceito, origem) VALUES (?,?,?,?,?)');
    gravarConsentimento.run(userId, 'terms', TERMOS_VERSION, 1, 'registration');
    gravarConsentimento.run(userId, 'marketing_email', MARKETING_VERSION, consentimentoMarketing ? 1 : 0, 'registration');
    return userId;
  }));
  criarSessao(ctx.res, id);
  ctx.status = 201;
  return { user: { id, nome, email, role: 'user', marketingConsent: consentimentoMarketing } };
});

rota('POST', '/api/auth/login', 'publico', (ctx) => {
  limitar(ctx, 'login', 20, 15 * 60 * 1000);
  const email = str(ctx.body.email, 'E-mail', { min: 1, max: 120 }).toLowerCase();
  const pass = typeof ctx.body.senha === 'string' ? ctx.body.senha : '';
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const ok = senha.verificar(pass, u ? u.senha_hash : senha.FALSO);
  if (!u || !ok) throw new HttpError(401, 'E-mail ou senha incorretos.');
  if (u.bloqueado) throw new HttpError(403, 'Esta conta foi bloqueada. Fale com a administração.');
  criarSessao(ctx.res, u.id);
  return { user: pub(u) };
});

rota('POST', '/api/auth/logout', 'publico', (ctx) => {
  const t = lerCookie(ctx.req, 'fw_sess');
  if (t) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(t));
  setCookie(ctx.res, '', 0);
  return { ok: true };
});

rota('GET', '/api/auth/eu', 'publico', (ctx) => ({ user: ctx.user ? pub(ctx.user) : null }));

rota('PATCH', '/api/auth/marketing', 'login', (ctx) => {
  if (typeof ctx.body.aceito !== 'boolean') throw bad('Informe se aceita receber comunicações de marketing.');
  limitar(ctx, 'consentimento-marketing', 10, 60 * 60 * 1000);
  const atual = db.prepare(`SELECT aceito FROM consent_records
                            WHERE user_id = ? AND tipo = 'marketing_email'
                            ORDER BY id DESC LIMIT 1`).get(ctx.user.id);
  const aceito = ctx.body.aceito ? 1 : 0;
  if (!atual || atual.aceito !== aceito) {
    db.prepare('INSERT INTO consent_records (user_id, tipo, versao, aceito, origem) VALUES (?,?,?,?,?)')
      .run(ctx.user.id, 'marketing_email', MARKETING_VERSION, aceito, 'account-settings');
  }
  return { aceito: aceito === 1 };
});

rota('GET', '/api/auth/exportar', 'login', (ctx) => {
  const userId = ctx.user.id;
  return {
    exportado_em: new Date().toISOString(),
    conta: db.prepare('SELECT nome, email, role, criado_em FROM users WHERE id = ?').get(userId),
    empresas: db.prepare(`SELECT id, nome, setor, sede, porte, tag, descricao, status, criado_em
                          FROM companies WHERE criado_por = ? ORDER BY criado_em`).all(userId),
    avaliacoes: db.prepare(`SELECT c.nome AS empresa, r.nome AS exibido_como, r.anonima, r.vinculo, r.cargo,
                                   r.n1, r.n2, r.n3, r.n4, r.titulo, r.texto, r.status, r.criado_em
                            FROM reviews r JOIN companies c ON c.id = r.company_id
                            WHERE r.user_id = ? ORDER BY r.criado_em`).all(userId),
    votos: db.prepare(`SELECT c.nome AS empresa, r.titulo AS avaliacao, v.tipo
               FROM votes v JOIN reviews r ON r.id = v.review_id
               JOIN companies c ON c.id = r.company_id
               WHERE v.user_id = ? ORDER BY c.nome, r.titulo`).all(userId),
    mensagens: db.prepare(`SELECT nome, email, assunto, mensagem, lida, criado_em
                           FROM mensagens WHERE user_id = ? ORDER BY criado_em`).all(userId),
    consentimentos: db.prepare(`SELECT tipo, versao, aceito, origem, criado_em
                                FROM consent_records WHERE user_id = ? ORDER BY id`).all(userId),
  };
});

rota('DELETE', '/api/auth/conta', 'login', (ctx) => {
  limitar(ctx, 'excluir-conta', 5, 60 * 60 * 1000);
  const atual = typeof ctx.body.senha === 'string' ? ctx.body.senha : '';
  const userId = ctx.user.id;
  const user = db.prepare('SELECT senha_hash, role FROM users WHERE id = ?').get(userId);
  if (!user || !senha.verificar(atual, user.senha_hash)) throw new HttpError(401, 'Senha atual incorreta.');
  tx(() => {
    if (user.role === 'admin' && db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n <= 1) {
      throw new HttpError(409, 'Crie outro administrador antes de excluir esta conta.');
    }
    db.prepare("DELETE FROM reviews WHERE user_id = ? AND status = 'pendente'").run(userId);
    db.prepare("UPDATE reviews SET user_id = NULL, nome = 'Anônimo', anonima = 1 WHERE user_id = ?").run(userId);
    db.prepare(`UPDATE companies SET criado_por = NULL
                WHERE criado_por = ? AND status = 'pendente'
                  AND EXISTS (SELECT 1 FROM reviews WHERE reviews.company_id = companies.id)`).run(userId);
    db.prepare("DELETE FROM companies WHERE criado_por = ? AND status = 'pendente'").run(userId);
    db.prepare('DELETE FROM mensagens WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  });
  setCookie(ctx.res, '', 0);
  return { ok: true };
});

rota('POST', '/api/auth/senha', 'login', (ctx) => {
  limitar(ctx, 'senha', 10, 15 * 60 * 1000);
  const atual = typeof ctx.body.atual === 'string' ? ctx.body.atual : '';
  const nova = senhaValida(ctx.body.nova, 'Nova senha');
  const u = db.prepare('SELECT senha_hash FROM users WHERE id = ?').get(ctx.user.id);
  if (!senha.verificar(atual, u.senha_hash)) throw new HttpError(401, 'A senha atual está incorreta.');
  db.prepare('UPDATE users SET senha_hash = ? WHERE id = ?').run(senha.hash(nova), ctx.user.id);
  const t = lerCookie(ctx.req, 'fw_sess');
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(ctx.user.id, sha(t || ''));
  return { ok: true };
});

/* ----- Empresas ----- */
rota('GET', '/api/empresas', 'publico', (ctx) => {
  const v = visibilidade(ctx.user);
  const q = norm(ctx.query.get('q') || '').trim();
  const cat = norm(ctx.query.get('categoria') || '').trim();
  const m = mapaNotas();
  return db.prepare(`SELECT * FROM companies WHERE ${v.sql}`).all(...v.p)
    .filter((c) => !q || norm(c.nome).includes(q))
    .filter((c) => !cat || categoriasDe(c.setor).some((x) => norm(x) === cat))
    .map((c) => empresaOut(c, m))
    .sort((a, b) => b.nota - a.nota || b.n - a.n || a.nome.localeCompare(b.nome, 'pt-BR'));
});

rota('GET', '/api/categorias', 'publico', (ctx) => {
  const v = visibilidade(ctx.user);
  const mapa = new Map();
  for (const c of db.prepare(`SELECT setor FROM companies WHERE ${v.sql}`).all(...v.p)) {
    for (const k of new Map(categoriasDe(c.setor).map((x) => [norm(x), x])).values()) {
      const chave = norm(k);
      mapa.set(chave, { nome: mapa.has(chave) ? mapa.get(chave).nome : k, n: (mapa.has(chave) ? mapa.get(chave).n : 0) + 1 });
    }
  }
  return [...mapa.values()].sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome, 'pt-BR'));
});

rota('GET', '/api/empresas/:id', 'publico', (ctx) => {
  const v = visibilidade(ctx.user);
  const c = db.prepare(`SELECT * FROM companies WHERE id = ? AND ${v.sql}`).get(ctx.params.id, ...v.p);
  if (!c) throw new HttpError(404, 'Empresa não encontrada.');
  const filtroVinculo = ['atual', 'ex'].includes(ctx.query.get('v')) ? ctx.query.get('v') : null;
  const ordem = ctx.query.get('o') === 'likes' ? 'likes DESC, r.id DESC' : 'r.id DESC';
  const uid = ctx.user ? ctx.user.id : -1;
  const linhas = db.prepare(`
    SELECT r.*,
      r.likes0 + (SELECT COUNT(*) FROM votes v WHERE v.review_id = r.id AND v.tipo = 'l') AS likes,
      r.dislikes0 + (SELECT COUNT(*) FROM votes v WHERE v.review_id = r.id AND v.tipo = 'd') AS dislikes,
      (SELECT tipo FROM votes v WHERE v.review_id = r.id AND v.user_id = ?) AS meuVoto
    FROM reviews r
    WHERE r.company_id = ? AND (r.status = 'aprovada' OR r.user_id = ?)
      ${filtroVinculo ? 'AND r.vinculo = ?' : ''}
    ORDER BY ${ordem}`).all(uid, c.id, uid, ...(filtroVinculo ? [filtroVinculo] : []));
  return {
    empresa: empresaOut(c, mapaNotas()),
    avaliacoes: linhas.map((r) => ({
      id: r.id, nome: r.nome, vinculo: r.vinculo, cargo: r.cargo, notas: [r.n1, r.n2, r.n3, r.n4],
      titulo: r.titulo, texto: r.texto, likes: r.likes, dislikes: r.dislikes, status: r.status,
      meuVoto: r.meuVoto || null, minha: ctx.user ? r.user_id === ctx.user.id : false, anonima: r.anonima === 1,
    })),
  };
});

/* ----- Cadastro por CNPJ (consulta à Receita Federal via BrasilAPI) ----- */
const ehDono = (c, u) => c.status === 'aprovada' || u.role === 'admin' || c.criado_por === u.id;
function consultaCnpj(cnpj) {
  return cnpjLib.consultar(cnpj).catch((e) => {
    if (e instanceof cnpjLib.ErroConsulta) throw new HttpError(e.status, e.message);
    throw e;
  });
}

rota('GET', '/api/cnpj/:cnpj', 'login', async (ctx) => {
  limitar(ctx, 'cnpj', 30, 60 * 60 * 1000);
  const cnpj = cnpjLib.limpar(ctx.params.cnpj);
  if (!cnpjLib.valido(cnpj)) throw bad('CNPJ inválido. Confira os números e tente de novo.');

  // Já cadastrada? (empresas pendentes de outras pessoas não revelam nome nem endereço)
  const ja = db.prepare('SELECT id, nome, status, criado_por FROM companies WHERE cnpj = ?').get(cnpj);
  if (ja) return { cadastrada: ehDono(ja, ctx.user) ? { id: ja.id, nome: ja.nome, status: ja.status } : { pendente: true } };

  const dados = await consultaCnpj(cnpj);

  // Empresas já cadastradas com nome parecido (evita duplicar)
  const v = visibilidade(ctx.user);
  const m = mapaNotas();
  const token = norm(dados.nome).split(/[^a-z0-9]+/).find((t) => t.length >= 3 && !['ltda', 'eireli', 'cia'].includes(t));
  const parecidas = !token ? [] : db.prepare(`SELECT * FROM companies WHERE ${v.sql}`).all(...v.p)
    .filter((c) => norm(c.nome).includes(token))
    .slice(0, 4)
    .map((c) => empresaOut(c, m));
  return { ...dados, parecidas };
});

rota('POST', '/api/empresas', 'login', async (ctx) => {
  limitar(ctx, 'nova-empresa', 20, 60 * 60 * 1000);
  const b = ctx.body;
  const cnpj = b.cnpj === undefined || b.cnpj === null || b.cnpj === '' ? null : cnpjLib.limpar(b.cnpj);
  if (cnpj && !cnpjLib.valido(cnpj)) throw bad('CNPJ inválido. Confira os números e tente de novo.');

  const setor = str(b.setor, 'Setor', { min: 1, max: 60 });
  const porte = opcao(b.porte, 'Faixa de funcionários', PORTES);
  const descDigitada = str(b.desc, 'Descrição', { max: 500, multi: true });
  if (descDigitada && descDigitada.length < 20) throw bad('"Descrição" deve ter pelo menos 20 caracteres (ou deixe em branco).');

  let nome, sede;
  if (cnpj) {
    // Nome e sede vêm da Receita Federal, não do navegador: o usuário não consegue "inventar" dados de um CNPJ.
    const ja = db.prepare('SELECT id, status, criado_por FROM companies WHERE cnpj = ?').get(cnpj);
    if (ja) throw new HttpError(409, 'Essa empresa já está cadastrada.', ehDono(ja, ctx.user) ? { id: ja.id } : {});
    const dados = await consultaCnpj(cnpj);
    nome = dados.nome;
    sede = dados.sede || str(b.sede, 'Sede', { min: 2, max: 80 });
    filtrar(ctx, [[descDigitada, 'Descrição']]);
  } else {
    nome = str(b.nome, 'Nome da empresa', { min: 2, max: 80 });
    sede = str(b.sede, 'Sede', { min: 2, max: 80 });
    filtrar(ctx, [[nome, 'Nome da empresa'], [setor, 'Setor'], [sede, 'Sede'], [descDigitada, 'Descrição']]);
  }
  const desc = descDigitada || 'Empresa cadastrada pela comunidade Feedwork.';

  let id = slug(nome);
  const mesmoNome = db.prepare('SELECT id, status, criado_por FROM companies WHERE id = ?').get(id);
  if (mesmoNome) {
    // Com CNPJ, duas empresas diferentes podem ter o mesmo nome (filiais, homônimas): o id ganha o CNPJ.
    if (!cnpj) throw new HttpError(409, 'Essa empresa já está cadastrada.', ehDono(mesmoNome, ctx.user) ? { id } : {});
    id = `${id}-${cnpj.toLowerCase()}`;
  }
  const status = MODERAR_EMPRESAS && ctx.user.role !== 'admin' ? 'pendente' : 'aprovada';
  try {
    db.prepare('INSERT INTO companies (id,nome,setor,sede,porte,descricao,status,criado_por,cnpj) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, nome, setor, sede, porte, desc, status, ctx.user.id, cnpj);
  } catch (e) {
    if (/UNIQUE/i.test(String(e && e.message))) throw new HttpError(409, 'Essa empresa já está cadastrada.');
    throw e;
  }
  ctx.status = 201;
  return { id, status, nome };
});

/* ----- Avaliações ----- */
rota('POST', '/api/avaliacoes', 'login', (ctx) => {
  limitar(ctx, 'avaliar', 30, 60 * 60 * 1000);
  const b = ctx.body;
  const empresa = str(b.empresa, 'Empresa', { min: 1, max: 100 });
  const c = db.prepare('SELECT id, status FROM companies WHERE id = ?').get(empresa);
  if (!c || (c.status !== 'aprovada' && ctx.user.role !== 'admin')) throw new HttpError(404, 'Empresa não encontrada.');
  const vinculo = opcao(b.vinculo, 'Relação com a empresa', ['atual', 'ex']);
  const cargo = str(b.cargo, 'Cargo', { min: 1, max: 80 });
  if (b.anonima !== undefined && typeof b.anonima !== 'boolean') throw bad('Opção de anonimato inválida.');
  const anonima = b.anonima !== false;                       // padrão: anônima
  const nome = anonima ? 'Anônimo' : ctx.user.nome;
  const titulo = str(b.titulo, 'Título', { min: 1, max: 80 });
  const texto = str(b.texto, 'Comentário', { min: 20, max: 3000, multi: true });
  filtrar(ctx, [[cargo, 'Cargo'], [titulo, 'Título'], [texto, 'Comentário']]);
  if (!Array.isArray(b.notas) || b.notas.length !== 4 || !b.notas.every((n) => Number.isInteger(n) && n >= 1 && n <= 5)) {
    throw bad('Notas inválidas: use valores de 1 a 5.');
  }
  if (db.prepare('SELECT 1 FROM reviews WHERE company_id = ? AND user_id = ?').get(c.id, ctx.user.id)) {
    throw new HttpError(409, 'Você já avaliou essa empresa.');
  }
  const status = MODERAR_AVALIACOES && ctx.user.role !== 'admin' ? 'pendente' : 'aprovada';
  db.prepare(`INSERT INTO reviews (company_id,user_id,nome,anonima,vinculo,cargo,n1,n2,n3,n4,titulo,texto,status)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(c.id, ctx.user.id, nome, anonima ? 1 : 0, vinculo, cargo, ...b.notas, titulo, texto, status);
  ctx.status = 201;
  return { status };
});

/* O autor só pode mudar COMO aparece (anônimo ou com o nome) ou excluir; o texto nunca é editável. */
function minhaAvaliacao(ctx) {
  const id = Number(ctx.params.id);
  const r = db.prepare('SELECT id, user_id FROM reviews WHERE id = ?').get(id);
  if (!r) throw new HttpError(404, 'Avaliação não encontrada.');
  if (r.user_id !== ctx.user.id) throw new HttpError(403, 'Você só pode alterar as suas próprias avaliações.');
  return id;
}
rota('PATCH', '/api/avaliacoes/:id', 'login', (ctx) => {
  const id = minhaAvaliacao(ctx);
  if (typeof ctx.body.anonima !== 'boolean') throw bad('Informe se a avaliação será anônima (true) ou com o seu nome (false).');
  const nome = ctx.body.anonima ? 'Anônimo' : ctx.user.nome;
  db.prepare('UPDATE reviews SET anonima = ?, nome = ? WHERE id = ?').run(ctx.body.anonima ? 1 : 0, nome, id);
  return { ok: true, anonima: ctx.body.anonima, nome };
});
rota('DELETE', '/api/avaliacoes/:id', 'login', (ctx) => {
  db.prepare('DELETE FROM reviews WHERE id = ?').run(minhaAvaliacao(ctx));
  return { ok: true };
});

rota('POST', '/api/avaliacoes/:id/voto', 'login', (ctx) => {
  const tipo = opcao(ctx.body.tipo, 'Voto', ['l', 'd']);
  const id = Number(ctx.params.id);
  const r = db.prepare("SELECT id FROM reviews WHERE id = ? AND status = 'aprovada'").get(id);
  if (!r) throw new HttpError(404, 'Avaliação não encontrada.');
  const atual = db.prepare('SELECT tipo FROM votes WHERE user_id = ? AND review_id = ?').get(ctx.user.id, id);
  if (atual && atual.tipo === tipo) db.prepare('DELETE FROM votes WHERE user_id = ? AND review_id = ?').run(ctx.user.id, id);
  else db.prepare('INSERT OR REPLACE INTO votes (user_id, review_id, tipo) VALUES (?,?,?)').run(ctx.user.id, id, tipo);
  return { ok: true };
});

/* ----- Fale conosco (qualquer visitante) ----- */
rota('POST', '/api/mensagens', 'publico', (ctx) => {
  limitar(ctx, 'mensagem', 5, 60 * 60 * 1000);
  const b = ctx.body;
  const nome = str(b.nome, 'Nome', { min: 2, max: 60 });
  const email = str(b.email, 'E-mail', { min: 5, max: 120 }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw bad('E-mail inválido.');
  const assunto = opcao(b.assunto, 'Assunto', ASSUNTOS);
  const mensagem = str(b.mensagem, 'Mensagem', { min: 10, max: 2000, multi: true });
  db.prepare('INSERT INTO mensagens (user_id, nome, email, assunto, mensagem) VALUES (?,?,?,?,?)')
    .run(ctx.user ? ctx.user.id : null, nome, email, assunto, mensagem);
  ctx.status = 201;
  return { ok: true };
});

/* ----- Contato B2B ----- */
rota('POST', '/api/contato', 'publico', (ctx) => {
  limitar(ctx, 'contato', 5, 60 * 60 * 1000);
  const empresa = str(ctx.body.empresa, 'Empresa', { min: 2, max: 100 });
  const email = str(ctx.body.email, 'E-mail', { min: 5, max: 120 }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw bad('E-mail inválido.');
  const plano = opcao(ctx.body.plano, 'Plano', PLANOS);
  db.prepare('INSERT INTO contatos (empresa, email, plano) VALUES (?,?,?)').run(empresa, email, plano);
  ctx.status = 201;
  return { ok: true };
});

/* ================================================================
   ADMINISTRAÇÃO
   ================================================================ */
const contar = (sql, ...p) => db.prepare(sql).get(...p).n;

rota('GET', '/api/admin/stats', 'admin', () => ({
  usuarios: contar('SELECT COUNT(*) n FROM users'),
  admins: contar("SELECT COUNT(*) n FROM users WHERE role = 'admin'"),
  bloqueados: contar('SELECT COUNT(*) n FROM users WHERE bloqueado = 1'),
  empresasAprovadas: contar("SELECT COUNT(*) n FROM companies WHERE status = 'aprovada'"),
  empresasPendentes: contar("SELECT COUNT(*) n FROM companies WHERE status = 'pendente'"),
  avaliacoesAprovadas: contar("SELECT COUNT(*) n FROM reviews WHERE status = 'aprovada'"),
  avaliacoesPendentes: contar("SELECT COUNT(*) n FROM reviews WHERE status = 'pendente'"),
  contatos: contar('SELECT COUNT(*) n FROM contatos'),
  mensagens: contar('SELECT COUNT(*) n FROM mensagens'),
  mensagensNovas: contar('SELECT COUNT(*) n FROM mensagens WHERE lida = 0'),
  palavras: contar('SELECT COUNT(*) n FROM palavras'),
}));

/* ----- Empresas ----- */
rota('GET', '/api/admin/empresas', 'admin', () =>
  db.prepare(`SELECT c.id, c.nome, c.setor, c.sede, c.porte, c.tag, c.descricao AS desc, c.status, c.criado_em,
                     u.nome AS criador_nome, u.email AS criador_email,
                     (SELECT COUNT(*) FROM reviews r WHERE r.company_id = c.id) AS avaliacoes
              FROM companies c LEFT JOIN users u ON u.id = c.criado_por
              ORDER BY (c.status = 'pendente') DESC, c.criado_em DESC, c.nome`).all());

rota('PATCH', '/api/admin/empresas/:id', 'admin', (ctx) => {
  const c = db.prepare('SELECT id FROM companies WHERE id = ?').get(ctx.params.id);
  if (!c) throw new HttpError(404, 'Empresa não encontrada.');
  const b = ctx.body, campos = [], vals = [];
  const set = (col, v) => { campos.push(`${col} = ?`); vals.push(v); };
  if (b.nome !== undefined) set('nome', str(b.nome, 'Nome', { min: 2, max: 80 }));
  if (b.setor !== undefined) set('setor', str(b.setor, 'Setor', { min: 1, max: 60 }));
  if (b.sede !== undefined) set('sede', str(b.sede, 'Sede', { min: 2, max: 80 }));
  if (b.porte !== undefined) set('porte', opcao(b.porte, 'Porte', PORTES));
  if (b.tag !== undefined) set('tag', str(b.tag, 'Selo', { min: 1, max: 60 }));
  if (b.desc !== undefined) set('descricao', str(b.desc, 'Descrição', { max: 500, multi: true }));
  if (b.status !== undefined) set('status', opcao(b.status, 'Status', ['aprovada', 'pendente']));
  if (!campos.length) throw bad('Nada para alterar.');
  db.prepare(`UPDATE companies SET ${campos.join(', ')} WHERE id = ?`).run(...vals, c.id);
  return { ok: true };
});

rota('DELETE', '/api/admin/empresas/:id', 'admin', (ctx) => {
  const r = db.prepare('DELETE FROM companies WHERE id = ?').run(ctx.params.id);
  if (!r.changes) throw new HttpError(404, 'Empresa não encontrada.');
  return { ok: true };
});

/* ----- Avaliações ----- */
rota('GET', '/api/admin/avaliacoes', 'admin', (ctx) => {
  const st = ctx.query.get('status');
  const filtro = ['aprovada', 'pendente'].includes(st);
  return db.prepare(`SELECT r.id, r.status, r.nome, r.vinculo, r.cargo, r.titulo, r.texto, r.criado_em,
                            (r.n1 + r.n2 + r.n3 + r.n4) / 4.0 AS media,
                            c.nome AS empresa, c.id AS empresa_id,
                            u.nome AS autor_nome, u.email AS autor_email
                     FROM reviews r JOIN companies c ON c.id = r.company_id LEFT JOIN users u ON u.id = r.user_id
                     ${filtro ? 'WHERE r.status = ?' : ''}
                     ORDER BY (r.status = 'pendente') DESC, r.id DESC`).all(...(filtro ? [st] : []));
});

rota('PATCH', '/api/admin/avaliacoes/:id', 'admin', (ctx) => {
  const status = opcao(ctx.body.status, 'Status', ['aprovada', 'pendente']);
  const r = db.prepare('UPDATE reviews SET status = ? WHERE id = ?').run(status, Number(ctx.params.id));
  if (!r.changes) throw new HttpError(404, 'Avaliação não encontrada.');
  return { ok: true };
});

rota('DELETE', '/api/admin/avaliacoes/:id', 'admin', (ctx) => {
  const r = db.prepare('DELETE FROM reviews WHERE id = ?').run(Number(ctx.params.id));
  if (!r.changes) throw new HttpError(404, 'Avaliação não encontrada.');
  return { ok: true };
});

/* ----- Usuários ----- */
rota('GET', '/api/admin/usuarios', 'admin', () =>
  db.prepare(`SELECT u.id, u.nome, u.email, u.role, u.bloqueado, u.criado_em,
                     (SELECT COUNT(*) FROM reviews r WHERE r.user_id = u.id) AS avaliacoes
              FROM users u ORDER BY u.id`).all());

function alvoUsuario(ctx) {
  const id = Number(ctx.params.id);
  if (id === ctx.user.id) throw bad('Você não pode alterar a sua própria conta por aqui.');
  const u = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!u) throw new HttpError(404, 'Usuário não encontrado.');
  return id;
}

rota('PATCH', '/api/admin/usuarios/:id', 'admin', (ctx) => {
  const id = alvoUsuario(ctx);
  const b = ctx.body;
  tx(() => {
    if (b.role !== undefined) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(opcao(b.role, 'Perfil', ['user', 'admin']), id);
    if (b.bloqueado !== undefined) {
      const bloq = b.bloqueado ? 1 : 0;
      db.prepare('UPDATE users SET bloqueado = ? WHERE id = ?').run(bloq, id);
      if (bloq) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    }
  });
  return { ok: true };
});

rota('DELETE', '/api/admin/usuarios/:id', 'admin', (ctx) => {
  const id = alvoUsuario(ctx);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  return { ok: true };
});

/* ----- Contatos B2B ----- */
rota('GET', '/api/admin/contatos', 'admin', () => db.prepare('SELECT * FROM contatos ORDER BY id DESC').all());
rota('DELETE', '/api/admin/contatos/:id', 'admin', (ctx) => {
  db.prepare('DELETE FROM contatos WHERE id = ?').run(Number(ctx.params.id));
  return { ok: true };
});

/* ----- Mensagens do "Fale conosco" ----- */
rota('GET', '/api/admin/mensagens', 'admin', () => db.prepare('SELECT * FROM mensagens ORDER BY lida ASC, id DESC').all());
rota('PATCH', '/api/admin/mensagens/:id', 'admin', (ctx) => {
  if (typeof ctx.body.lida !== 'boolean') throw bad('Valor inválido.');
  const r = db.prepare('UPDATE mensagens SET lida = ? WHERE id = ?').run(ctx.body.lida ? 1 : 0, Number(ctx.params.id));
  if (!r.changes) throw new HttpError(404, 'Mensagem não encontrada.');
  return { ok: true };
});
rota('DELETE', '/api/admin/mensagens/:id', 'admin', (ctx) => {
  db.prepare('DELETE FROM mensagens WHERE id = ?').run(Number(ctx.params.id));
  return { ok: true };
});

/* ----- Filtro de palavras ----- */
rota('GET', '/api/admin/palavras', 'admin', () => db.prepare('SELECT id, palavra, criado_em FROM palavras ORDER BY palavra').all());
rota('POST', '/api/admin/palavras', 'admin', (ctx) => {
  const bruto = str(ctx.body.palavras, 'Palavras', { min: 1, max: 2000, multi: true });
  const lista = [...new Set(bruto.split(/[\n,;]+/).map((x) => x.trim().toLowerCase().replace(/\s+/g, ' ')).filter(Boolean))];
  if (!lista.length) throw bad('Digite ao menos uma palavra.');
  if (lista.length > 100) throw bad('Máximo de 100 palavras por vez.');
  let novas = 0;
  tx(() => {
    for (const p of lista) {
      if (p.length < 2 || p.length > 40 || !filtroLib.compilar(p)) throw bad(`"${p}" não é válida: use de 2 a 40 caracteres, com letras ou números.`);
      novas += Number(db.prepare('INSERT OR IGNORE INTO palavras (palavra) VALUES (?)').run(p).changes);
    }
  });
  carregarFiltro();
  ctx.status = 201;
  return { adicionadas: novas };
});
rota('DELETE', '/api/admin/palavras/:id', 'admin', (ctx) => {
  db.prepare('DELETE FROM palavras WHERE id = ?').run(Number(ctx.params.id));
  carregarFiltro();
  return { ok: true };
});

/* ================================================================
   SERVIDOR
   ================================================================ */
const server = http.createServer((req, res) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'self'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400); return res.end(); }
  if (url.pathname.startsWith('/api/')) return void tratarApi(req, res, url);
  estatico(req, res, url.pathname);
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`\n[ERRO] A porta ${PORT} já está em uso. Feche o outro programa ou rode com outra porta:  PORT=3001 node server.js\n`);
  else console.error(e);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log('\n  FeedWork rodando em  http://' + (HOST === '0.0.0.0' ? 'localhost' : HOST) + ':' + PORT);
  console.log('  Banco de dados:      ' + DB_PATH);
  console.log('  Moderação:           empresas=' + (MODERAR_EMPRESAS ? 'sim' : 'não') + ' | avaliações=' + (MODERAR_AVALIACOES ? 'sim' : 'não'));
  if (adminCriado) {
    console.log('\n  >>> Administrador criado: ' + adminCriado.email);
  }
  console.log('');
});

function encerrar() { server.close(); try { db.close(); } catch { /* ok */ } process.exit(0); }
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
