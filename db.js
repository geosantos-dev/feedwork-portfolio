'use strict';
// Banco de dados SQLite (módulo nativo node:sqlite, Node 22.13+).

// O Node avisa que o módulo é "experimental"; escondemos só esse aviso.
const emitOriginal = process.emitWarning;
process.emitWarning = function (w, ...args) {
  if (/sqlite/i.test(String((w && w.message) || w))) return;
  return emitOriginal.call(process, w, ...args);
};

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  console.error('\n[ERRO] Este projeto precisa do Node.js 22.13 ou mais novo (usa o SQLite que já vem no Node).');
  console.error('       Sua versão: ' + process.version + '  ->  baixe em https://nodejs.org\n');
  process.exit(1);
}

const fs = require('node:fs');
const path = require('node:path');
const senha = require('./senha');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'feedwork.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nome        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash  TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  bloqueado   INTEGER NOT NULL DEFAULT 0,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expira_em   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS companies (
  id          TEXT PRIMARY KEY,
  nome        TEXT NOT NULL,
  setor       TEXT NOT NULL,
  sede        TEXT NOT NULL,
  porte       TEXT NOT NULL,
  tag         TEXT NOT NULL DEFAULT 'Nova na plataforma',
  descricao   TEXT NOT NULL DEFAULT '',
  n0          INTEGER NOT NULL DEFAULT 0,          -- avaliações "históricas" (dados iniciais)
  base        TEXT NOT NULL DEFAULT '[0,0,0,0]',   -- notas médias históricas por categoria
  status      TEXT NOT NULL DEFAULT 'aprovada' CHECK (status IN ('aprovada','pendente')),
  criado_por  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  nome        TEXT NOT NULL DEFAULT 'Anônimo',
  vinculo     TEXT NOT NULL CHECK (vinculo IN ('atual','ex')),
  cargo       TEXT NOT NULL,
  n1 INTEGER NOT NULL, n2 INTEGER NOT NULL, n3 INTEGER NOT NULL, n4 INTEGER NOT NULL,
  titulo      TEXT NOT NULL,
  texto       TEXT NOT NULL,
  likes0      INTEGER NOT NULL DEFAULT 0,
  dislikes0   INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'aprovada' CHECK (status IN ('aprovada','pendente')),
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reviews_company ON reviews(company_id, status);

CREATE TABLE IF NOT EXISTS votes (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  review_id   INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('l','d')),
  PRIMARY KEY (user_id, review_id)
);

CREATE TABLE IF NOT EXISTS contatos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa     TEXT NOT NULL,
  email       TEXT NOT NULL,
  plano       TEXT NOT NULL,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS meta (chave TEXT PRIMARY KEY, valor TEXT);

CREATE TABLE IF NOT EXISTS rate_limit_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  chave      TEXT NOT NULL,
  ip         TEXT NOT NULL,
  criado_em  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_lookup ON rate_limit_events(chave, ip, criado_em);

CREATE TABLE IF NOT EXISTS consent_records (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('terms', 'marketing_email')),
  versao      TEXT NOT NULL,
  aceito      INTEGER NOT NULL CHECK (aceito IN (0, 1)),
  origem      TEXT NOT NULL,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_consent_records_user ON consent_records(user_id, tipo, id);
`);

function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

db.exec(`
CREATE TABLE IF NOT EXISTS palavras (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  palavra     TEXT NOT NULL UNIQUE COLLATE NOCASE,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mensagens (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  nome        TEXT NOT NULL,
  email       TEXT NOT NULL,
  assunto     TEXT NOT NULL,
  mensagem    TEXT NOT NULL,
  lida        INTEGER NOT NULL DEFAULT 0,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

/* ===== Migração: bancos criados pela versão anterior ganham a coluna "anonima" ===== */
if (!db.prepare('PRAGMA table_info(reviews)').all().some((c) => c.name === 'anonima')) {
  db.exec('ALTER TABLE reviews ADD COLUMN anonima INTEGER NOT NULL DEFAULT 1');
  // quem já tinha apelido visível continua visível; "Anônimo" continua anônimo
  db.exec("UPDATE reviews SET anonima = CASE WHEN nome = 'Anônimo' THEN 1 ELSE 0 END WHERE user_id IS NOT NULL");
}

/* ===== Migração: empresas ganham a coluna opcional "cnpj" (cadastro por CNPJ) ===== */
if (!db.prepare('PRAGMA table_info(companies)').all().some((c) => c.name === 'cnpj')) {
  db.exec('ALTER TABLE companies ADD COLUMN cnpj TEXT');
}
// Único só entre empresas que têm CNPJ: as cadastradas manualmente (cnpj vazio) não são afetadas.
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_cnpj ON companies(cnpj) WHERE cnpj IS NOT NULL');

/* ===== Dados iniciais (fictícios) — só entram na primeira execução ===== */
const SEED_CO = [
  ['nubank', 'Nubank', 'Fintech / Tecnologia', 'São Paulo - SP', '1.001 a 5.000', 'Plano de Carreira Excelente', 339, [4.7, 4.6, 4.5, 4.6], 'O Nubank possui um modelo de ciclos de carreira estruturados duas vezes ao ano ("performance cycles"). Ambiente colaborativo e foco no cliente.'],
  ['mercadolivre', 'Mercado Livre', 'E-commerce / Logística', 'Osasco - SP', '+5.000', 'Boa Progressão', 511, [4.3, 4.4, 4.2, 4.3], 'Gigante do e-commerce na América Latina com grande foco em inovação e expansão. Oferece muitas oportunidades de crescimento.'],
  ['techcorp', 'TechCorp Brasil', 'Software & Serviços', 'Campinas - SP', '201 a 1.000', 'Carreira Estruturada', 144, [4.4, 4.5, 4.3, 4.4], 'Empresa focada em transformação digital de grandes corporações. Possui uma matriz de cargos muito clara e bem definida.'],
  ['innovatelab', 'InnovateLab', 'Inovação / Startups', 'Florianópolis - SC', '51 a 200', 'Cultura de Inovação', 98, [4.2, 4.3, 4.1, 4.4], 'Laboratório de inovação que desenvolve produtos digitais com times enxutos e muita autonomia.'],
  ['xp', 'XP Inc.', 'Finanças / Investimentos', 'São Paulo - SP', '+5.000', 'Alta Performance', 276, [4.1, 4.2, 4.0, 4.2], 'Uma das maiores plataformas de investimentos do país, com cultura orientada a resultados.'],
];
const SEED_REV = [
  ['nubank', 'Juliana S.', 'ex', 'Analista', [5, 4, 4, 5], 'Ótima empresa para crescer', 'Grandes aprendizados e um excelente plano de carreira. Cultura muito colaborativa.', 32, 1],
  ['nubank', 'Rafael M.', 'atual', 'Desenvolvedor', [4, 4, 5, 4], 'Ambiente incrível, com pontos de melhoria', 'Benefícios ótimos. A comunicação interna poderia ser mais clara em alguns momentos.', 21, 3],
  ['nubank', 'Carla T.', 'ex', 'Designer', [4, 5, 4, 5], 'Experiência transformadora!', 'Trabalhei por 2 anos e foi uma das melhores experiências da minha vida profissional.', 18, 0],
  ['mercadolivre', 'Pedro A.', 'atual', 'Analista de Operações', [4, 4, 4, 4], 'Muito espaço para crescer', 'Promoções frequentes para quem entrega resultado. Ritmo intenso.', 14, 2],
  ['techcorp', 'Marina L.', 'ex', 'Consultora', [4, 5, 4, 4], 'Matriz de cargos clara', 'Sabia exatamente o que precisava para ser promovida. Faltou flexibilidade em alguns projetos.', 9, 1],
];

function semear() {
  if (db.prepare("SELECT 1 FROM meta WHERE chave = 'seed'").get()) return;
  tx(() => {
    const ic = db.prepare('INSERT INTO companies (id,nome,setor,sede,porte,tag,n0,base,descricao) VALUES (?,?,?,?,?,?,?,?,?)');
    for (const c of SEED_CO) ic.run(c[0], c[1], c[2], c[3], c[4], c[5], c[6], JSON.stringify(c[7]), c[8]);
    const ir = db.prepare('INSERT INTO reviews (company_id,nome,vinculo,cargo,n1,n2,n3,n4,titulo,texto,likes0,dislikes0) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
    for (const r of SEED_REV) ir.run(r[0], r[1], r[2], r[3], ...r[4], r[5], r[6], r[7], r[8]);
    db.prepare("INSERT INTO meta (chave, valor) VALUES ('seed', '1')").run();
  });
}

/* ===== Administrador inicial ===== */
function criarAdmin() {
  if (db.prepare("SELECT 1 FROM users WHERE role = 'admin'").get()) return null;
  const email = (process.env.ADMIN_EMAIL || 'admin@feedwork.com').trim().toLowerCase();
  const pass = process.env.ADMIN_SENHA;
  if (typeof pass !== 'string' || pass.length < 12 || pass.length > 200) {
    throw new Error('Defina ADMIN_SENHA com uma senha de 12 a 200 caracteres para criar o administrador inicial.');
  }
  const existente = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existente) {
    db.prepare("UPDATE users SET role = 'admin', bloqueado = 0 WHERE id = ?").run(existente.id);
  } else {
    db.prepare("INSERT INTO users (nome,email,senha_hash,role) VALUES ('Administrador',?,?,'admin')").run(email, senha.hash(pass));
  }
  return { email };
}

/* ===== Filtro de palavras: lista inicial (o administrador edita no painel) ===== */
// O filtro já reconhece sozinho disfarces (p0rra, p u t a, puuuta, p*ta...). O "*" no fim também pega as derivadas.
const PALAVRAS_INICIAIS = ['porra*', 'caralh*', 'merd*', 'puta', 'putas', 'putaria', 'putinha', 'buceta*', 'foda-se', 'fdp', 'arrombad*', 'cuzao'];
function semearPalavras() {
  if (!db.prepare("SELECT 1 FROM meta WHERE chave = 'palavras'").get()) {
    tx(() => {
      const ins = db.prepare('INSERT OR IGNORE INTO palavras (palavra) VALUES (?)');
      for (const p of PALAVRAS_INICIAIS) ins.run(p);
      db.prepare("INSERT INTO meta (chave, valor) VALUES ('palavras', '1'), ('palavras_v2', '1')").run();
    });
    return;
  }
  // Bancos criados antes: troca as palavras iniciais pela versão que também pega derivadas (só se ainda existirem)
  if (db.prepare("SELECT 1 FROM meta WHERE chave = 'palavras_v2'").get()) return;
  tx(() => {
    const achar = db.prepare('SELECT id FROM palavras WHERE palavra = ?');
    const trocar = db.prepare('UPDATE palavras SET palavra = ? WHERE id = ?');
    for (const [antiga, nova] of [['porra', 'porra*'], ['caralho', 'caralh*'], ['merda', 'merd*'], ['buceta', 'buceta*'], ['arrombado', 'arrombad*']]) {
      const l = achar.get(antiga);
      if (l && !achar.get(nova)) trocar.run(nova, l.id);
    }
    if (achar.get('puta')) for (const p of ['putas', 'putaria', 'putinha']) db.prepare('INSERT OR IGNORE INTO palavras (palavra) VALUES (?)').run(p);
    db.prepare("INSERT INTO meta (chave, valor) VALUES ('palavras_v2', '1')").run();
  });
}

semear();
semearPalavras();
const adminCriado = criarAdmin();

module.exports = { db, tx, DB_PATH, adminCriado };
