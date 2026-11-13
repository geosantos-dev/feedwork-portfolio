'use strict';
/**
 * FeedWork — consulta de CNPJ (sem dependências externas).
 *  - limpar():   tira pontos, barra e traço e deixa em maiúsculas
 *  - valido():   confere os dígitos verificadores (aceita o CNPJ alfanumérico, em vigor desde julho/2026)
 *  - consultar(): busca os dados na BrasilAPI (dados abertos da Receita Federal)
 *
 * Para trocar a API ou testar sem internet, defina CNPJ_API_URL
 * (padrão: https://brasilapi.com.br/api/cnpj/v1).
 */
const API = (process.env.CNPJ_API_URL || 'https://brasilapi.com.br/api/cnpj/v1').replace(/\/+$/, '');

class ErroConsulta extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

/* ===== Validação ===== */
function limpar(v) {
  return String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

// Cada caractere vale (código ASCII − 48): números 0–9 e letras A–Z (A = 17 ... Z = 42).
function digitoVerificador(base) {
  let soma = 0, peso = base.length - 7;
  for (const ch of base) {
    soma += (ch.charCodeAt(0) - 48) * peso--;
    if (peso < 2) peso = 9;
  }
  const r = soma % 11;
  return r < 2 ? 0 : 11 - r;
}

function valido(c) {
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c)) return false;
  if (/^(.)\1{13}$/.test(c)) return false;            // 00000000000000, 11111111111111...
  return digitoVerificador(c.slice(0, 12)) === Number(c[12])
      && digitoVerificador(c.slice(0, 13)) === Number(c[13]);
}

function formatar(c) {
  return c.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5');
}

/* ===== Texto ===== */
const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'nas', 'nos', 'para', 'a', 'o']);
const SIGLAS = new Set(['ltda', 's/a', 's.a.', 's.a', 'sa', 'me', 'epp', 'eireli', 'mei', 'ti', 'tv', 'eua']);

// A Receita devolve tudo em MAIÚSCULAS; deixamos em formato de título (só se vier todo em maiúsculas).
function titulo(s) {
  s = String(s ?? '').trim().replace(/\s+/g, ' ');
  if (!s || s !== s.toUpperCase()) return s;
  return s.toLowerCase().split(' ').map((w, i) => {
    if (SIGLAS.has(w)) return w.toUpperCase();
    if (i > 0 && MINUSCULAS.has(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

// MEI e empresário individual têm o CPF colado no nome. Removemos para não expor o número.
const semCpf = (s) => String(s ?? '').replace(/\b\d{11}\b/g, '').replace(/\s+/g, ' ').trim();

function telefone(v) {
  const d = String(v ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return '';
}

/* ===== Setor (a partir do CNAE principal) → lista de setores do FeedWork ===== */
function setorPorCnae(cnae) {
  const c = String(cnae ?? '').replace(/\D/g, '').padStart(7, '0');
  const div = Number(c.slice(0, 2));
  if (c.startsWith('582') || (div >= 61 && div <= 63)) return 'Tecnologia';
  if (div >= 64 && div <= 66) return 'Finanças';
  if (div >= 45 && div <= 47) return 'Varejo';
  if (div === 86) return 'Saúde';
  if (div === 85) return 'Educação';
  if (div >= 10 && div <= 33) return 'Indústria';
  if ((div >= 41 && div <= 43) || (div >= 49 && div <= 56) || (div >= 68 && div <= 82) || (div >= 90 && div <= 96)) return 'Serviços';
  return 'Outro';
}

/* ===== Consulta ===== */
function normalizar(d, cnpj) {
  const razaoSocial = titulo(semCpf(d.razao_social));
  const nomeFantasia = titulo(semCpf(d.nome_fantasia));
  const cidade = titulo(d.municipio);
  const uf = String(d.uf ?? '').toUpperCase();
  return {
    cnpj,
    razaoSocial,
    nomeFantasia,
    nome: (nomeFantasia || razaoSocial).slice(0, 80),
    situacao: String(d.descricao_situacao_cadastral ?? '').toUpperCase(),
    setor: setorPorCnae(d.cnae_fiscal),
    atividade: String(d.cnae_fiscal_descricao ?? ''),
    sede: cidade && uf ? `${cidade} - ${uf}`.slice(0, 80) : '',
    telefone: telefone(d.ddd_telefone_1),
  };
}

const cache = new Map();                  // evita consultar a mesma empresa várias vezes
const CACHE_MS = 10 * 60 * 1000;

async function consultar(cnpj) {
  const guardado = cache.get(cnpj);
  if (guardado && guardado.ate > Date.now()) return guardado.dados;

  let resp;
  try {
    resp = await fetch(`${API}/${cnpj}`, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json', 'User-Agent': 'FeedWork/1.0 (projeto academico)' } });
  } catch (e) {
    console.error('[cnpj] não consegui falar com a API:', e && e.cause ? (e.cause.code || e.cause.message) : (e && e.message));
    throw new ErroConsulta(503, 'Não foi possível consultar a Receita Federal agora. Tente de novo em instantes ou cadastre a empresa manualmente.');
  }
  if (resp.status === 404 || resp.status === 400) throw new ErroConsulta(404, 'CNPJ não encontrado na Receita Federal. Confira os números.');
  if (!resp.ok) {
    let corpo = '';
    try { corpo = (await resp.text()).slice(0, 200); } catch { /* ok */ }
    console.error(`[cnpj] a API respondeu com erro ${resp.status}: ${corpo}`);
  }
  if (!resp.ok) throw new ErroConsulta(503, 'O serviço de consulta de CNPJ está indisponível. Tente de novo em instantes ou cadastre a empresa manualmente.');

  let json;
  try { json = await resp.json(); } catch { json = null; }
  if (!json || typeof json !== 'object' || !(json.razao_social || json.nome_fantasia)) {
    throw new ErroConsulta(503, 'A consulta de CNPJ devolveu uma resposta inesperada. Cadastre a empresa manualmente.');
  }
  const dados = normalizar(json, cnpj);
  if (cache.size > 500) cache.clear();
  cache.set(cnpj, { dados, ate: Date.now() + CACHE_MS });
  return dados;
}

module.exports = { ErroConsulta, limpar, valido, formatar, consultar, normalizar, setorPorCnae, titulo };
