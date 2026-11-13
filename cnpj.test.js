'use strict';
/**
 * Testes do cadastro por CNPJ. Rode com:  npm test
 * Não usa internet: sobe uma "API de CNPJ" falsa e um servidor FeedWork com banco temporário.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const cnpj = require('./cnpj');

test('valida CNPJ numérico e alfanumérico', () => {
  assert.equal(cnpj.valido(cnpj.limpar('00.000.000/0001-91')), true);
  assert.equal(cnpj.valido(cnpj.limpar('00.432.705/0001-88')), true);
  assert.equal(cnpj.valido(cnpj.limpar('12.ABC.345/01DE-35')), true);   // exemplo oficial da Receita
  assert.equal(cnpj.valido(cnpj.limpar('12.ABC.345/01DE-36')), false);  // dígito errado
  assert.equal(cnpj.valido('11111111111111'), false);
  assert.equal(cnpj.valido('123'), false);
});

test('formata nomes, remove CPF de MEI e escolhe o setor', () => {
  assert.equal(cnpj.titulo('KN WAAGEN BALANCAS DE PRECISAO LTDA'), 'Kn Waagen Balancas de Precisao LTDA');
  const d = cnpj.normalizar({ razao_social: 'JOAO DA SILVA 12345678901', nome_fantasia: '', municipio: 'SAO PAULO', uf: 'sp', cnae_fiscal: 6201501, ddd_telefone_1: '1146123995', descricao_situacao_cadastral: 'ATIVA' }, '00000000000191');
  assert.equal(d.nome, 'Joao da Silva');
  assert.equal(d.sede, 'Sao Paulo - SP');
  assert.equal(d.setor, 'Tecnologia');
  assert.equal(d.telefone, '(11) 4612-3995');
});

/* ===== Fluxo completo ===== */
const EMPRESAS = {
  '00432705000188': { cnpj: '00432705000188', razao_social: 'KN WAAGEN BALANCAS LTDA', nome_fantasia: 'KN WAAGEN', municipio: 'SAO PAULO', uf: 'SP', cnae_fiscal: 2829199, cnae_fiscal_descricao: 'Fabricacao de maquinas', ddd_telefone_1: '1146123995', descricao_situacao_cadastral: 'ATIVA' },
};
let api, app, base, cookie, dir;

test.before(async () => {
  api = http.createServer((req, res) => {
    const d = EMPRESAS[req.url.split('/').pop()];
    res.writeHead(d ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(d || { message: 'nao encontrado' }));
  });
  await new Promise((ok) => api.listen(0, '127.0.0.1', ok));
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-'));
  const porta = 34000 + Math.floor(Math.random() * 2000);
  base = `http://127.0.0.1:${porta}`;
  app = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, PORT: String(porta), DB_PATH: path.join(dir, 't.db'), CNPJ_API_URL: `http://127.0.0.1:${api.address().port}`, ADMIN_EMAIL: 'admin@teste.com', ADMIN_SENHA: 'senha-bem-grande-123' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { await fetch(base + '/api/categorias'); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  const r = await fetch(base + '/api/auth/registrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: 'Teste', email: 'teste@teste.com', senha: 'uma-senha-grande-123', aceitouTermos: true }) });
  cookie = r.headers.get('set-cookie').split(';')[0];
});
test.after(() => { app.kill(); api.close(); fs.rmSync(dir, { recursive: true, force: true }); });

const chamar = (metodo, url, body) => fetch(base + url, { method: metodo, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined })
  .then(async (r) => ({ status: r.status, json: await r.json() }));

test('consulta exige login e recusa CNPJ inválido', async () => {
  const anon = await fetch(base + '/api/cnpj/00432705000188');
  assert.equal(anon.status, 401);
  assert.equal((await chamar('GET', '/api/cnpj/123')).status, 400);
  assert.equal((await chamar('GET', '/api/cnpj/00000000000191')).status, 404);   // válido, mas inexistente na API falsa
});

test('busca, cadastra com dados da Receita e bloqueia duplicado', async () => {
  const busca = await chamar('GET', '/api/cnpj/00.432.705%2F0001-88');
  assert.equal(busca.status, 200);
  assert.equal(busca.json.nome, 'Kn Waagen');
  assert.equal(busca.json.sede, 'Sao Paulo - SP');
  assert.equal(busca.json.setor, 'Indústria');
  assert.deepEqual(busca.json.parecidas, []);

  // o navegador tenta mandar nome falso: o servidor ignora e usa o da Receita
  const cad = await chamar('POST', '/api/empresas', { cnpj: '00.432.705/0001-88', nome: 'Nome Inventado', setor: 'Indústria', porte: '1 a 50', desc: '' });
  assert.equal(cad.status, 201);
  assert.equal(cad.json.nome, 'Kn Waagen');
  assert.equal(cad.json.status, 'pendente');

  const dup = await chamar('POST', '/api/empresas', { cnpj: '00432705000188', setor: 'Indústria', porte: '1 a 50', desc: '' });
  assert.equal(dup.status, 409);
  const denovo = await chamar('GET', '/api/cnpj/00432705000188');
  assert.equal(denovo.json.cadastrada.nome, 'Kn Waagen');
});

test('cadastro manual (sem CNPJ) continua funcionando', async () => {
  const r = await chamar('POST', '/api/empresas', { nome: 'Padaria do Zé', setor: 'Varejo', sede: 'Cotia - SP', porte: '1 a 50', desc: '' });
  assert.equal(r.status, 201);
  const repetida = await chamar('POST', '/api/empresas', { nome: 'Padaria do Zé', setor: 'Varejo', sede: 'Cotia - SP', porte: '1 a 50', desc: '' });
  assert.equal(repetida.status, 409);
});
