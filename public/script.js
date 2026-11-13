/* ===== Utilitários ===== */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = m => { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = 'none', 3200) };
const stars = n => `<span class="star">${'★'.repeat(Math.round(n))}${'☆'.repeat(5 - Math.round(n))}</span>`;
const fmtData = d => d ? new Date(d.replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR') : '';
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

/* Chamada à API (sempre JSON, cookie de sessão vai junto) */
async function api(url, { method, body } = {}) {
  const m = method || (body ? 'POST' : 'GET');
  const r = await fetch(url, {
    method: m, credentials: 'same-origin',
    headers: m === 'GET' ? {} : { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : (m === 'GET' ? undefined : '{}')
  });
  let d = {};
  try { d = await r.json() } catch (e) { }
  if (!r.ok) { const err = new Error(d.erro || 'Erro ' + r.status); err.status = r.status; err.data = d; throw err }
  return d;
}

/* ===== Estado ===== */
const CATS = ['Liderança e gestão', 'Plano de carreira', 'Salários e benefícios', 'Ambiente de trabalho'];
let ME = null, Q = '', TAB = 'geral', NEXTTAB = null, FIL = { v: 'todos', o: 'recentes' };
let AUTH = 'login', ADM = 'painel', ADMF = 'todos', RETORNO = null, RT = 0, CAT = '';

const nota = c => c.n ? c.nota.toFixed(1) : '–';
const tile = c => `<div class="tile">${esc(c.nome[0].toUpperCase())}</div>`;
const opts = (cs, sel) => cs.map(c => `<option value="${esc(c.id)}" ${c.id == sel ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');
const badgeEmp = s => s == 'pendente' ? '<span class="badge pend">Em análise</span>' : '';
const precisaLogin = acao => { RETORNO = location.hash; return `<div class="pg"><div class="card form"><h2>Entre para continuar</h2><p class="mut">Você precisa estar logado para ${acao}.</p><br><a class="btn" href="#/entrar">Entrar ou criar conta</a></div></div>` };

/* ===== Páginas públicas ===== */
function coCard(c) {
  return `<a class="card cc" href="#/empresa/${esc(c.id)}"><div class="top">${tile(c)}<div><b>${esc(c.nome)}</b><div class="mut" style="font-size:16px">${esc(c.setor)}</div></div><span class="rate"><span class="star">★</span> ${nota(c)}</span></div>
<span class="tag">✨ ${esc(c.tag)}</span>${badgeEmp(c.status)}<p>${esc(c.desc)}</p><div class="foot"><span>${c.n} avaliações</span><b>Ver detalhes →</b></div></a>`
}
async function home() {
  const cs = (await api('/api/empresas')).filter(c => c.status == 'aprovada');
  const chips = [...cs].sort((a, b) => b.n - a.n).slice(0, 4);
  const top = [...cs].sort((a, b) => b.nota - a.nota || b.n - a.n).slice(0, 3);
  return `<section class="hero"><div class="hl"><span class="chip">A nova era da transparência profissional no Brasil</span>
<h1>Como é de verdade trabalhar e crescer na sua próxima empresa?</h1></div>
<div class="hr rv"><p class="lede"><span class="drop">D</span>escubra planos de carreira reais, políticas de promoção, salários e relatos honestos de quem já esteve lá dentro.</p>
<form class="sform" data-submit="search"><label for="q">Procure uma empresa</label><div class="sbox"><input id="q" placeholder="Digite o nome da empresa (ex: Nubank, TechCorp)"><button class="btn">Buscar</button></div></form>
<div class="chips"><span class="mut">Mais buscadas:</span>${chips.map(c => `<a href="#/empresa/${esc(c.id)}">${esc(c.nome)}</a>`).join('')}</div></div></section>
<section class="stats rv"><div class="in"><div><b data-n>+2.500</b><span>Empresas avaliadas</span></div><div><b data-n>+45.000</b><span>Ex-funcionários colaborando</span></div><div><b data-n>98%</b><span>Moderação rigorosa</span></div><div><b data-n>100%</b><span>Anonimato garantido</span></div></div></section>
<section class="sec"><div class="sec-h"><h2 class="dh" style="margin:0">Empresas com melhores planos de carreira</h2><a class="more" href="#/empresas">Ver todas →</a></div>
<div class="leads">${top.map((c, i) => `<a class="lead rv" href="#/empresa/${esc(c.id)}"><span class="num">${i + 1}</span><h3>${esc(c.nome)}</h3><span class="kick">Nota ${nota(c)} · ${esc(c.tag)}</span></a>`).join('')}</div></section>
<section class="sec why"><h2 class="dh">Por que o Feed<em>Work</em>?</h2>
<div class="cols"><div class="col rv"><span class="kick">Carreira</span><h3>Foco em plano de carreira</h3><p>Saiba com precisão se a empresa promove por mérito ou por antiguidade, qual o ciclo de avaliação e se as promessas de subida de cargo são reais.</p></div>
<div class="col rv"><span class="kick">Fontes</span><h3>Ex-funcionários confiáveis</h3><p>Quem já saiu da empresa tem liberdade total para relatar os pontos fortes e fracos sem medo de retaliação corporativa, garantindo total veracidade.</p></div>
<div class="col rv"><span class="kick">Salários</span><h3>Transparência salarial</h3><p>Compare faixas salariais reais por nível (Júnior, Pleno, Sênior, Gerente) e saiba quanto negociar em sua próxima proposta de emprego.</p></div></div></section>`
}
function buscar(e) { e.preventDefault(); Q = $('#q').value.trim(); CAT = ''; location.hash = '#/empresas'; return false }

async function empresas() {
  const [f, cats] = await Promise.all([api('/api/empresas?q=' + encodeURIComponent(Q) + '&categoria=' + encodeURIComponent(CAT)), api('/api/categorias')]);
  const barra = cats.length ? `<div class="catbar"><button class="${CAT ? '' : 'on'}" data-action="category" data-cat="">Todas</button>${cats.map(c => `<button class="${CAT && CAT.toLowerCase() == c.nome.toLowerCase() ? 'on' : ''}" data-action="category" data-cat="${esc(c.nome)}">${esc(c.nome)} (${c.n})</button>`).join('')}</div>` : '';
  const resumo = `<p class="mut" style="margin:14px 0 0">${f.length} empresa(s) encontrada(s)${CAT ? ` em <b>${esc(CAT)}</b>` : ''}${Q ? ` para "<b>${esc(Q)}</b>"` : ''}</p>`;
  return `<div class="pg"><h2>Empresas</h2><form class="sbox" style="margin:0 0 10px;max-width:none" data-submit="company-search"><input id="q" value="${esc(Q)}" placeholder="Pesquise uma empresa..."><button class="btn">Pesquisar →</button></form>
 ${barra}${resumo}
 ${f.length ? `<div class="grid">${f.map(coCard).join('')}</div>` : `<div class="card" style="margin-top:24px">Nenhuma empresa encontrada. ${(CAT || Q) ? '<button class="btn sm o" data-action="clear-filters">Limpar filtros</button> ' : ''}<a class="btn sm" href="#/nova-empresa">Cadastrar${Q ? ` "${esc(Q)}"` : ' empresa'}</a></div>`}</div>`
}
function setCat(c) { const q = $('#q'); if (q) Q = q.value.trim(); CAT = c; route(true) }
function limparFiltros() { Q = ''; CAT = ''; route(true) }

async function empresa(id) {
  let d;
  try { d = await api(`/api/empresas/${encodeURIComponent(id)}?v=${FIL.v}&o=${FIL.o}`) } catch (e) { return `<div class="pg">Empresa não encontrada.</div>` }
  const c = d.empresa, rs = d.avaliacoes;
  return `<div class="pg"><a class="more" href="#/empresas">← Voltar para resultados</a>
 <div class="head" style="margin-top:20px">${tile(c)}<div><h1>${esc(c.nome)} ${badgeEmp(c.status)}</h1><div class="mut">${esc(c.setor)}</div><div>${nota(c)} ${stars(c.nota)} <span class="mut">(${c.n} avaliações)</span></div></div>${c.status == 'aprovada' ? `<a class="btn" href="#/avaliar/${esc(c.id)}">Avaliar empresa</a>` : ''}</div>
 <div class="tabs"><button class="${TAB == 'geral' ? 'on' : ''}" data-action="company-tab" data-tab="geral">Visão geral</button><button class="${TAB == 'av' ? 'on' : ''}" data-action="company-tab" data-tab="av">Avaliações (${c.n})</button></div>
 ${TAB == 'geral' ? `<div class="two"><div class="card"><div class="big">${nota(c)}</div><div style="text-align:center">${stars(c.nota)}<div class="mut">Nota geral</div></div><br>${CATS.map((n, i) => `<div class="bar"><span>${n}</span><i><b style="width:${c.cats[i] * 20}%"></b></i>${c.n ? c.cats[i].toFixed(1) : '–'}</div>`).join('')}</div>
 <div class="card"><h3>Sobre a empresa</h3><p style="margin:10px 0 16px;color:var(--mut)">${esc(c.desc)}</p><p class="mut">Setor: ${esc(c.setor)}<br>Sede: ${esc(c.sede)}<br>Funcionários: ${esc(c.porte)}</p></div></div>`
       : `<div class="layout"><aside class="card"><b>Filtros</b><label>Tipo de avaliação</label><select data-change="review-filter" data-filter="v"><option value="todos">Todos</option><option value="atual" ${FIL.v == 'atual' ? 'selected' : ''}>Funcionários atuais</option><option value="ex" ${FIL.v == 'ex' ? 'selected' : ''}>Ex-funcionários</option></select>
     <label>Ordenar por</label><select data-change="review-filter" data-filter="o"><option value="recentes">Mais recentes</option><option value="likes" ${FIL.o == 'likes' ? 'selected' : ''}>Mais úteis</option></select></aside>
 <div>${rs.length ? rs.map(revCard).join('') : '<div class="card">Ainda não há avaliações. Seja a primeira pessoa a avaliar!</div>'}</div></div>`}</div>`
}
function revCard(r) {
  const emAnalise = r.status == 'pendente';
  const dono = r.minha ? `<div class="dono"><span class="mut">Sua avaliação · aparece como <b>${r.anonima ? 'Anônimo' : esc(r.nome)}</b></span><div class="acts"><button class="btn sm o" data-action="review-anon" data-id="${r.id}" data-anon="${!r.anonima}">${r.anonima ? 'Mostrar meu nome' : 'Tornar anônima'}</button><button class="btn sm o" data-action="review-delete" data-id="${r.id}">Excluir avaliação</button></div></div>` : '';
  return `<div class="card rev"><span class="badge ${r.vinculo == 'ex' ? 'ex' : ''}">${r.vinculo == 'ex' ? 'Ex-funcionário(a)' : 'Funcionário(a) atual'}</span>${emAnalise ? '<span class="badge pend">Em análise — só você vê</span>' : ''}<span class="mut">${esc(r.nome)} · ${esc(r.cargo)}</span> ${stars(avg(r.notas))}
 <h4>${esc(r.titulo)}</h4><p style="color:var(--mut);white-space:pre-line">${esc(r.texto)}</p>
 ${emAnalise ? '' : `<div class="vote"><button class="${r.meuVoto == 'l' ? 'on' : ''}" data-action="vote" data-id="${r.id}" data-vote="l">👍 Útil (${r.likes})</button><button class="${r.meuVoto == 'd' ? 'on' : ''}" data-action="vote" data-id="${r.id}" data-vote="d">👎 Não útil (${r.dislikes})</button></div>`}${dono}</div>`
}
async function alternarAnon(id, anon) {
  try { await api('/api/avaliacoes/' + id, { method: 'PATCH', body: { anonima: anon } }); toast(anon ? 'Sua avaliação agora aparece como Anônimo.' : 'Sua avaliação agora mostra o seu nome.'); route(true) } catch (e) { toast(e.message) }
}
async function excluirAv(id) {
  if (!confirm('Excluir a sua avaliação? Essa ação não pode ser desfeita.')) return;
  try { await api('/api/avaliacoes/' + id, { method: 'DELETE' }); toast('Avaliação excluída.'); route(true) } catch (e) { toast(e.message) }
}
async function votar(id, t) {
  if (!ME) { RETORNO = location.hash; toast('Entre na sua conta para votar.'); location.hash = '#/entrar'; return }
  try { await api(`/api/avaliacoes/${id}/voto`, { body: { tipo: t } }); route(true) } catch (e) { toast(e.message) }
}

async function avaliar(id) {
  if (!ME) return precisaLogin('avaliar uma empresa');
  const cs = (await api('/api/empresas')).filter(c => c.status == 'aprovada');
  return `<div class="pg"><form class="card form" data-submit="review"><h2>Avalie uma empresa</h2><p class="mut">Sua experiência pode ajudar outras pessoas a fazerem escolhas melhores.</p>
 <label>Qual empresa você deseja avaliar?</label><select id="emp" required>${opts(cs, id)}</select><p class="mut" style="margin-top:6px">Não encontrou? <a class="more" href="#/nova-empresa">Cadastre a empresa</a></p>
 <label>Qual é a sua relação com a empresa?</label><select id="vin"><option value="atual">Funcionário(a) atual</option><option value="ex">Ex-funcionário(a)</option></select>
 <div class="row"><div><label>Seu cargo</label><input id="cargo" required maxlength="80" placeholder="Ex.: Analista"></div><div><label>Como sua avaliação aparece</label><select id="anon"><option value="1">Anônima (padrão)</option><option value="0">Com o meu nome (${esc(ME.nome)})</option></select></div></div>
 <label>Dê uma nota (1 a 5 estrelas)</label><div class="row">${CATS.map((n, i) => `<div class="nrow"><span class="mut">${n}</span><div class="nline"><div class="nstars" role="radiogroup" aria-label="${n}">${[5, 4, 3, 2, 1].map(x => `<input type="radio" name="nota${i}" id="n${i}-${x}" value="${x}" required><label for="n${i}-${x}" title="${x} de 5">★</label>`).join('')}</div><span class="nval" aria-live="polite">Toque nas estrelas</span></div></div>`).join('')}</div>
 <label>Título da avaliação</label><input id="tit" required maxlength="80">
 <label>Comentário</label><textarea id="txt" rows="5" required minlength="20" maxlength="3000" data-count-min="20" data-count-max="3000" data-count-optional="false" placeholder="Conte como é trabalhar nessa empresa..."></textarea><div class="hint"><span>Mínimo 20 caracteres</span><span class="cnt">0/3000</span></div><br>
 <button class="btn" style="width:100%">Publicar avaliação</button><div class="note">🔒 Você escolhe como aparecer: anônima ou com o seu nome. Depois de publicada dá para mudar isso, ou excluir a avaliação, mas não dá para editar o texto.</div></form></div>`
}
/* Contador de caracteres logo abaixo do campo (a div .hint tem de vir logo depois do campo) */
function contar(el, min, max, opcional) {
  const h = el.nextElementSibling, t = el.value.trim().length, msg = h.firstElementChild;
  h.querySelector('.cnt').textContent = el.value.length + '/' + max;
  if (opcional && !t) { msg.textContent = 'Opcional. Se preencher, mínimo ' + min + ' caracteres'; h.classList.remove('ok') }
  else if (t >= min) { msg.textContent = 'Mínimo de ' + min + ' caracteres atingido ✓'; h.classList.add('ok') }
  else { msg.textContent = 'Mínimo ' + min + ' caracteres — faltam ' + (min - t); h.classList.remove('ok') }
}
async function enviarAv(e) {
  e.preventDefault(); const id = $('#emp').value;
  try {
    const r = await api('/api/avaliacoes', { body: { empresa: id, vinculo: $('#vin').value, cargo: $('#cargo').value, anonima: $('#anon').value == '1', notas: CATS.map((_, i) => +document.querySelector(`input[name="nota${i}"]:checked`).value), titulo: $('#tit').value, texto: $('#txt').value } });
    toast(r.status == 'pendente' ? 'Avaliação enviada! Ela será publicada após aprovação da moderação.' : 'Avaliação publicada!');
    TAB = 'av'; FIL.v = 'todos'; NEXTTAB = 'av'; location.hash = '#/empresa/' + id
  } catch (err) { toast(err.message) }
  return false
}

/* ===== Cadastro de empresa: com CNPJ (busca na Receita Federal) ou manual ===== */
const SETORES_FE = ['Tecnologia', 'Finanças', 'Varejo', 'Saúde', 'Educação', 'Indústria', 'Serviços', 'Outro'];
const PORTES_FE = ['1 a 50', '51 a 200', '201 a 1.000', '1.001 a 5.000', '+5.000'];
let NE = null;   // etapa do cadastro: intro | cnpj | existente | parecidas | dados | manual | pronto
const mascaraCnpj = v => String(v).toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 14)
  .replace(/^(.{2})(.{0,3})(.{0,3})(.{0,4})(.{0,2}).*/, (_, a, b, c, d, e) => a + (b ? '.' + b : '') + (c ? '.' + c : '') + (d ? '/' + d : '') + (e ? '-' + e : ''));
const optsFixas = (lista, sel) => lista.map(x => `<option ${x == sel ? 'selected' : ''}>${esc(x)}</option>`).join('');
const irEtapa = (et, txt, cls = 'linkbtn') => `<button type="button" class="${cls}" data-action="ne-go" data-etapa="${et}">${txt}</button>`;

async function novaEmpresa() {
  if (!ME) return precisaLogin('cadastrar uma empresa');
  if (!NE) NE = { etapa: 'intro' };
  const d = NE.dados;
  switch (NE.etapa) {
    case 'intro': return `<div class="pg"><div class="card form ne"><h2>Você tem o CNPJ da empresa?</h2>
 <p class="mut">Esse é o jeito mais fácil de cadastrar uma empresa: buscamos os dados na Receita Federal.</p>
 <div class="note">O CNPJ é um número mais ou menos assim:<div class="ne-ex">XX.XXX.XXX/XXXX-XX</div><span>Os CNPJs novos podem ter letras e números.</span></div>
 <p class="mut" style="margin-top:14px">Não sabe qual é? Dá para achar com uma consulta rápida na internet: pesquise no navegador "CNPJ" e o nome da empresa.</p>
 <div class="ne-links"><button type="button" class="btn" style="width:100%" data-action="ne-go" data-etapa="cnpj">Achei o CNPJ!</button>${irEtapa('manual', 'Não sei o CNPJ')}</div></div></div>`;
    case 'cnpj': return `<div class="pg"><form class="card form ne" data-submit="cnpj-buscar"><h2>Nova empresa</h2>
 <label for="ncnpj" style="display:flex;justify-content:space-between;gap:12px">CNPJ ${irEtapa('intro', 'Como achar o CNPJ?')}</label>
 <input id="ncnpj" required autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="18" placeholder="00.000.000/0000-00" value="${esc(NE.cnpjTexto || '')}">
 <div class="hint"><span>Esse é o jeito mais fácil de cadastrar uma empresa</span></div>
 <div class="ne-links"><button class="btn" style="width:100%">Continuar</button>${irEtapa('manual', 'Não sei o CNPJ')}</div></form></div>`;
    case 'existente': {
      const e = NE.existente;
      return `<div class="pg"><div class="card form ne"><h2>Essa empresa já está no Feedwork</h2>${e.pendente
        ? '<p class="mut">Já existe um cadastro com esse CNPJ, aguardando aprovação da moderação. Assim que for aprovado, a empresa aparecerá para todos.</p>'
        : `<p class="mut">O CNPJ informado já está cadastrado. Não é preciso cadastrar de novo.</p><div class="ne-found"><dl><div><dt>Empresa</dt><dd>${esc(e.nome)}</dd></div></dl></div>`}
 <div class="ne-links">${e.pendente ? '' : `<a class="btn" style="width:100%;text-align:center" href="#/${e.status == 'aprovada' ? 'avaliar' : 'empresa'}/${esc(e.id)}">${e.status == 'aprovada' ? 'Avaliar essa empresa' : 'Ver empresa'}</a>`}${irEtapa('cnpj', 'Buscar outro CNPJ')}</div></div></div>`;
    }
    case 'parecidas': return `<div class="pg"><div class="card ne" style="max-width:900px;margin:auto"><h2 style="font-size:30px;margin-top:0">Encontramos empresas parecidas com a sua busca</h2>
 <p class="mut">Essas empresas já estão cadastradas no Feedwork e têm o nome semelhante ao do CNPJ informado. Alguma delas é a que você procura?</p>
 <div class="grid">${d.parecidas.map(coCard).join('')}</div>
 <div class="ne-links">${irEtapa('dados', 'Não é a empresa que procuro')}</div></div></div>`;
    case 'dados': return `<div class="pg"><form class="card form ne" data-submit="company-create-cnpj"><h2>Nova empresa</h2>
 <label style="display:flex;justify-content:space-between;gap:12px">CNPJ ${irEtapa('cnpj', 'Trocar CNPJ')}</label><input value="${esc(mascaraCnpj(d.cnpj))}" readonly aria-readonly="true">
 <label>Encontramos!</label>
 <div class="ne-found"><dl>
  <div><dt>Razão social</dt><dd>${esc(d.razaoSocial || d.nome)}</dd></div>
  ${d.nomeFantasia && d.nomeFantasia != d.razaoSocial ? `<div><dt>Nome fantasia</dt><dd>${esc(d.nomeFantasia)}</dd></div>` : ''}
  <div><dt>Sede</dt><dd>${esc(d.sede || '—')}</dd></div>
  ${d.telefone ? `<div><dt>Telefone</dt><dd>${esc(d.telefone)}</dd></div>` : ''}
  <div><dt>Atividade principal</dt><dd>${esc(d.atividade || '—')}</dd></div>
  <div><dt>Situação cadastral</dt><dd><span class="badge ${d.situacao == 'ATIVA' ? 'ok' : 'pend'}">${esc(d.situacao || '—')}</span></dd></div>
 </dl><div class="src">Fonte: Receita Federal</div></div>
 ${d.situacao && d.situacao != 'ATIVA' ? '<div class="note">Essa empresa não está com a situação "Ativa" na Receita. Você ainda pode cadastrá-la, por exemplo para ex-funcionários avaliarem.</div>' : ''}
 <div class="row"><div><label for="ns">Setor</label><select id="ns">${optsFixas(SETORES_FE, d.setor)}</select></div>
 <div><label for="np">Faixa de funcionários</label><select id="np">${optsFixas(PORTES_FE)}</select></div></div>
 <label for="nx">Descrição</label><textarea id="nx" rows="3" minlength="20" maxlength="500" data-count-min="20" data-count-max="500" data-count-optional="true" placeholder="Fale brevemente sobre a empresa"></textarea><div class="hint"><span>Opcional. Se preencher, mínimo 20 caracteres</span><span class="cnt">0/500</span></div>
 <div class="ne-links"><button class="btn" style="width:100%">Esta é a empresa que procuro</button>${irEtapa('cnpj', 'Não é a empresa que procuro')}</div></form></div>`;
    case 'pronto': {
      const r = NE.resultado, ok = r.status == 'aprovada';
      return `<div class="pg"><div class="card form ne"><h2>Tudo pronto!</h2>
 <p class="mut">${ok ? 'A empresa foi cadastrada e agora você já pode avaliá-la.' : 'Empresa enviada! Ela aparecerá para todos após a aprovação da moderação.'}</p>
 <div class="ne-found"><dl><div style="display:flex;gap:14px;align-items:center"><div class="tile">${esc((r.nome || '?')[0].toUpperCase())}</div><dd>${esc(r.nome)}</dd></div></dl></div>
 <div class="ne-links">${ok ? `<a class="btn" style="width:100%;text-align:center" href="#/avaliar/${esc(r.id)}">Avaliar essa empresa</a>` : `<a class="btn" style="width:100%;text-align:center" href="#/empresa/${esc(r.id)}">Ver empresa</a>`}${irEtapa('intro', 'Cadastrar outra empresa')}</div></div></div>`;
    }
    default: return `<div class="pg"><form class="card form" data-submit="company-create"><h2>Cadastrar nova empresa</h2><p class="mut">A empresa que você procura não está na lista? Cadastre-a e seja a primeira pessoa a avaliar.</p>
 <div class="note" style="margin-top:0">Sabe o CNPJ? ${irEtapa('intro', 'Cadastre pelo CNPJ')} e preenchemos os dados para você.</div>
 <label>Nome da empresa</label><input id="cn" required maxlength="80">
 <div class="row"><div><label>Setor</label><select id="cs">${optsFixas(SETORES_FE)}</select></div>
 <div><label>Faixa de funcionários</label><select id="cp">${optsFixas(PORTES_FE)}</select></div></div>
 <label>Sede (cidade - UF)</label><input id="cd" placeholder="São Paulo - SP" required maxlength="80">
 <label>Descrição</label><textarea id="cx" rows="3" minlength="20" maxlength="500" data-count-min="20" data-count-max="500" data-count-optional="true" placeholder="Fale brevemente sobre a empresa"></textarea><div class="hint"><span>Opcional. Se preencher, mínimo 20 caracteres</span><span class="cnt">0/500</span></div><br><button class="btn" style="width:100%">Cadastrar empresa</button></form></div>`;
  }
}
async function buscarCnpj(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button.btn'), rotulo = btn.textContent;
  NE.cnpjTexto = $('#ncnpj').value;
  btn.disabled = true; btn.textContent = 'Buscando...';
  try {
    const r = await api('/api/cnpj/' + encodeURIComponent(NE.cnpjTexto.replace(/[^0-9A-Za-z]/g, '')));
    if (r.cadastrada) { NE.existente = r.cadastrada; NE.etapa = 'existente' }
    else { NE.dados = r; NE.etapa = r.parecidas.length ? 'parecidas' : 'dados' }
    route();
  } catch (err) { toast(err.message); btn.disabled = false; btn.textContent = rotulo }
  return false
}
async function enviarEmpCnpj(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button.btn'), rotulo = btn.textContent;
  btn.disabled = true; btn.textContent = 'Cadastrando...';
  try {
    const r = await api('/api/empresas', { body: { cnpj: NE.dados.cnpj, setor: $('#ns').value, porte: $('#np').value, desc: $('#nx').value } });
    NE = { etapa: 'pronto', resultado: r }; route();
  } catch (err) {
    toast(err.message); btn.disabled = false; btn.textContent = rotulo;
    if (err.status == 409 && err.data && err.data.id) location.hash = '#/empresa/' + err.data.id
  }
  return false
}
async function enviarEmp(e) {
  e.preventDefault();
  try {
    const r = await api('/api/empresas', { body: { nome: $('#cn').value, setor: $('#cs').value, sede: $('#cd').value, porte: $('#cp').value, desc: $('#cx').value } });
    NE = { etapa: 'pronto', resultado: r }; route();
  } catch (err) {
    toast(err.message);
    if (err.status == 409 && err.data && err.data.id) location.hash = '#/empresa/' + err.data.id
  }
  return false
}

function b2b() {
  return `<div class="pg"><div class="eyebrow">FEEDWORK PARA EMPRESAS (B2B)</div><h2>Entenda o que dizem seus funcionários e ex-funcionários</h2><p class="mut" style="font-size:17px">O lado B2C é gratuito. A receita vem de ferramentas e dados para o RH das empresas:</p>
 <div class="grid"><div class="card feat"><div class="ic">📊</div><h3>Painel de Insights e RH Analytics</h3><p>Relatórios e dashboards sobre o que ex-funcionários dizem, gargalos no plano de carreira e talentos perdidos para a concorrência.</p></div>
 <div class="card feat"><div class="ic">🏅</div><h3>Selo de Transparência</h3><p>Empresas bem avaliadas assinam o selo "Empresa Certificada Feedwork" para usar em vagas e atrair melhores profissionais.</p></div>
 <div class="card feat"><div class="ic">📣</div><h3>Resposta e Atração</h3><p>Responda avaliações publicamente, publique vagas direcionadas e destaque sua cultura na plataforma.</p></div></div>
 <h2 style="margin-top:50px">Fale com a gente</h2><form class="card form" style="margin:0" data-submit="b2b-contact"><label>Empresa</label><input id="bc" required maxlength="100"><label>E-mail corporativo</label><input id="be" type="email" required maxlength="120"><label>Plano de interesse</label><select id="bp"><option>Painel de Insights</option><option>Selo de Transparência</option><option>Resposta e Atração</option></select><br><br><button class="btn">Solicitar demonstração</button></form></div>`
}
async function enviarContato(e) {
  e.preventDefault();
  try { await api('/api/contato', { body: { empresa: $('#bc').value, email: $('#be').value, plano: $('#bp').value } }); toast('Contato enviado! Retornaremos em breve.'); e.target.reset() } catch (err) { toast(err.message) }
  return false
}

/* ===== Fale conosco (usuários) ===== */
function contato() {
  const assuntos = ['Dúvida', 'Sugestão', 'Problema no site', 'Denúncia', 'Elogio', 'Outro'];
  return `<div class="pg"><form class="card form" data-submit="contact"><h2>Fale conosco</h2><p class="mut">Dúvidas, sugestões ou algum problema? Mande uma mensagem para a equipe do FeedWork.</p>
 <div class="row"><div><label>Seu nome</label><input id="mn" required minlength="2" maxlength="60" value="${esc(ME ? ME.nome : '')}"></div><div><label>Seu e-mail</label><input id="me" type="email" required maxlength="120" value="${esc(ME ? ME.email : '')}"></div></div>
 <label>Assunto</label><select id="ma">${assuntos.map(a => `<option>${a}</option>`).join('')}</select>
 <label>Mensagem</label><textarea id="mm" rows="6" required minlength="10" maxlength="2000" data-count-min="10" data-count-max="2000" data-count-optional="false" placeholder="Escreva sua mensagem..."></textarea><div class="hint"><span>Mínimo 10 caracteres</span><span class="cnt">0/2000</span></div><br>
 <button class="btn" style="width:100%">Enviar mensagem</button><div class="note">Se precisar de resposta, usaremos o e-mail informado acima.</div></form></div>`
}
async function enviarMensagem(e) {
  e.preventDefault();
  try {
    await api('/api/mensagens', { body: { nome: $('#mn').value, email: $('#me').value, assunto: $('#ma').value, mensagem: $('#mm').value } });
    toast('Mensagem enviada! Obrigado pelo contato.'); $('#mm').value = ''; contar($('#mm'), 10, 2000, false)
  } catch (err) { toast(err.message) }
  return false
}

/* ===== Conta: entrar, cadastrar, perfil ===== */
function entrar() {
  if (ME) return `<div class="pg"><div class="card form"><h2>Olá, ${esc(ME.nome)}</h2><p class="mut">${esc(ME.email)} ${ME.role == 'admin' ? '<span class="badge adm">Administrador</span>' : ''}</p><br>
  <div class="acts">${ME.role == 'admin' ? '<a class="btn" href="#/admin">Abrir painel admin</a>' : ''}<button class="btn o" data-action="export-data">Baixar meus dados</button><button class="btn o" data-action="logout">Sair</button></div></div>
  <form class="card form" style="margin-top:18px" data-submit="password-change"><h3>Alterar senha</h3><label>Senha atual</label><input id="sa" type="password" required autocomplete="current-password"><label>Nova senha (mín. 12 caracteres)</label><input id="sn" type="password" required minlength="12" autocomplete="new-password"><br><br><button class="btn">Salvar nova senha</button></form>
  <form class="card form" style="margin-top:18px" data-submit="marketing-consent"><h3>Comunicações de marketing</h3><label class="consent-check"><input id="marketing-setting" type="checkbox" ${ME.marketingConsent ? 'checked' : ''}><span>Aceito receber comunicações de marketing por e-mail. Essa opção é separada dos Termos de Uso e pode ser retirada a qualquer momento.</span></label><br><button class="btn">Salvar preferência</button></form>
  <form class="card form danger-zone" style="margin-top:18px" data-submit="account-delete"><h3>Excluir conta</h3><p class="mut">Avaliações aprovadas serão mantidas como anônimas. Avaliações pendentes e mensagens vinculadas serão removidas. Empresas aprovadas permanecem publicadas; empresas pendentes com avaliações de outras pessoas também serão mantidas sem vínculo.</p><label>Senha atual para confirmar</label><input id="excluir-senha" type="password" required autocomplete="current-password"><br><br><button class="btn">Excluir minha conta</button><p class="mut">Se esta for a única conta administradora, crie outra antes de excluir.</p></form></div>`;
  const reg = AUTH == 'registro';
    return `<div class="pg"><div class="card form"><div class="tabs" style="margin-top:0"><button class="${reg ? '' : 'on'}" data-action="auth-mode" data-mode="login">Entrar</button><button class="${reg ? 'on' : ''}" data-action="auth-mode" data-mode="registro">Criar conta</button></div>
    ${reg ? `<form data-submit="register"><h2>Criar conta</h2><label>Nome</label><input id="rn" required minlength="2" maxlength="60" autocomplete="name"><label>E-mail</label><input id="re" type="email" required autocomplete="email"><label>Senha (mín. 12 caracteres)</label><input id="rs" type="password" required minlength="12" autocomplete="new-password"><label class="consent-check"><input id="terms-accepted" type="checkbox" required><span>Li e aceito os <a href="#/termos" target="_blank" rel="noopener noreferrer">Termos de Uso</a>. Consulte também a <a href="#/privacidade" target="_blank" rel="noopener noreferrer">Política de Privacidade</a>.</span></label><label class="consent-check"><input id="marketing-accepted" type="checkbox"><span>Aceito receber comunicações de marketing por e-mail (opcional).</span></label><br><button class="btn" style="width:100%">Criar conta</button></form>`
      : `<form data-submit="login"><h2>Entrar no Feedwork</h2><label>E-mail</label><input id="le" type="email" required autocomplete="email"><label>Senha</label><input id="ls" type="password" required autocomplete="current-password"><br><br><button class="btn" style="width:100%">Entrar</button><div class="note">Ainda não tem conta? Clique em "Criar conta" acima.</div></form>`}
  </div></div>`
}
function depoisDoLogin(user, msg) {
  ME = user; setLogin(); toast(msg);
  const ir = RETORNO && RETORNO != '#/entrar' ? RETORNO : '#/'; RETORNO = null; location.hash = ir
}
async function logar(e) {
  e.preventDefault();
  try { const d = await api('/api/auth/login', { body: { email: $('#le').value, senha: $('#ls').value } }); depoisDoLogin(d.user, 'Bem-vindo(a)!') } catch (err) { toast(err.message) }
  return false
}
async function registrar(e) {
  e.preventDefault();
  try { const d = await api('/api/auth/registrar', { body: { nome: $('#rn').value, email: $('#re').value, senha: $('#rs').value, aceitouTermos: $('#terms-accepted').checked, consentimentoMarketing: $('#marketing-accepted').checked } }); depoisDoLogin(d.user, 'Conta criada! Bem-vindo(a).') } catch (err) { toast(err.message) }
  return false
}
async function atualizarConsentimentoMarketing(e) {
  e.preventDefault();
  const aceito = $('#marketing-setting').checked;
  try {
    await api('/api/auth/marketing', { method: 'PATCH', body: { aceito } });
    ME.marketingConsent = aceito;
    toast(aceito ? 'Consentimento de marketing registrado.' : 'Consentimento de marketing retirado.');
  } catch (err) { toast(err.message) }
  return false
}
async function trocarSenha(e) {
  e.preventDefault();
  try { await api('/api/auth/senha', { body: { atual: $('#sa').value, nova: $('#sn').value } }); toast('Senha alterada com sucesso.'); e.target.reset() } catch (err) { toast(err.message) }
  return false
}
async function exportarMeusDados() {
  try {
    const dados = await api('/api/auth/exportar');
    const url = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `feedwork-meus-dados-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) { toast(err.message) }
}
async function excluirMinhaConta(e) {
  e.preventDefault();
  if (!confirm('Excluir sua conta? Avaliações aprovadas serão mantidas como anônimas. Esta ação não pode ser desfeita.')) return false;
  try {
    await api('/api/auth/conta', { method: 'DELETE', body: { senha: $('#excluir-senha').value } });
    ME = null; AUTH = 'login'; setLogin(); toast('Conta excluída.'); location.hash = '#/'; route();
  } catch (err) { toast(err.message) }
  return false
}
async function sair() { try { await api('/api/auth/logout', { method: 'POST' }) } catch (e) { } ME = null; setLogin(); AUTH = 'login'; location.hash = '#/'; route() }
const setLogin = () => {
  $('#login').textContent = ME ? 'Olá, ' + ME.nome.split(' ')[0] : 'Entrar';
  $('#adminlink').style.display = ME && ME.role == 'admin' ? '' : 'none'
};

/* ===== Administração ===== */
const ADM_ABAS = [['painel', 'Painel'], ['empresas', 'Empresas'], ['avaliacoes', 'Avaliações'], ['usuarios', 'Usuários'], ['mensagens', 'Mensagens'], ['contatos', 'Contatos B2B'], ['palavras', 'Filtro de palavras']];
const vazio = t => `<div class="card">${t}</div>`;
const tabela = (cab, linhas) => `<div class="tbl-w card" style="padding:8px"><table class="tbl"><thead><tr>${cab.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${linhas.join('')}</tbody></table></div>`;
const bStatus = s => s == 'pendente' ? '<span class="badge pend">Pendente</span>' : '<span class="badge ok">Aprovada</span>';

async function admin() {
  if (!ME || ME.role != 'admin') return `<div class="pg"><div class="card form"><h2>Acesso restrito</h2><p class="mut">Esta área é exclusiva para administradores.</p><br><a class="btn" href="#/entrar">Entrar</a></div></div>`;
  const s = await api('/api/admin/stats');
  const corpo = await ({ painel: () => admPainel(s), empresas: admEmpresas, avaliacoes: admAvaliacoes, usuarios: admUsuarios, mensagens: admMensagens, contatos: admContatos, palavras: admPalavras }[ADM] || (() => admPainel(s)))();
  return `<div class="pg"><div class="eyebrow">ADMINISTRAÇÃO</div><h2>Painel do administrador</h2>
  <div class="tabs">${ADM_ABAS.map(([k, n]) => `<button class="${ADM == k ? 'on' : ''}" data-action="admin-mode" data-mode="${esc(k)}">${n}${k == 'mensagens' && s.mensagensNovas ? ` <span class="badge pend">${s.mensagensNovas}</span>` : ''}</button>`).join('')}</div>${corpo}</div>`
}
async function admPainel(s) {
  const k = (n, t, aba, alerta) => `<a class="card kpi ${alerta && n ? 'alerta' : ''}" href="#/admin" data-action="admin-kpi" data-mode="${esc(aba)}"><b>${n}</b><span>${t}</span></a>`;
  return `<div class="kpis">${k(s.usuarios, 'Usuários cadastrados', 'usuarios')}${k(s.empresasAprovadas, 'Empresas publicadas', 'empresas')}${k(s.empresasPendentes, 'Empresas aguardando aprovação', 'empresas', 1)}
  ${k(s.avaliacoesAprovadas, 'Avaliações publicadas', 'avaliacoes')}${k(s.avaliacoesPendentes, 'Avaliações aguardando aprovação', 'avaliacoes', 1)}${k(s.mensagensNovas, 'Mensagens novas (Fale conosco)', 'mensagens', 1)}
  ${k(s.contatos, 'Contatos B2B recebidos', 'contatos')}${k(s.palavras, 'Palavras no filtro', 'palavras')}</div>
  <p class="mut" style="margin-top:18px">Administradores: ${s.admins} · Contas bloqueadas: ${s.bloqueados}</p>`
}
async function adm(url, method, body, msg, confirma) {
  if (confirma && !confirm(confirma)) return;
  try { await api(url, { method, body }); toast(msg); route(true) } catch (e) { toast(e.message) }
}
const adminAction = (url, method, body, message, confirma, text, className = 'btn sm o') =>
  `<button class="${className}" data-action="admin-request" data-url="${esc(url)}" data-method="${esc(method)}" data-body="${esc(JSON.stringify(body))}" data-message="${esc(message)}" data-confirm="${esc(confirma || '')}">${esc(text)}</button>`;
async function admEmpresas() {
  const cs = await api('/api/admin/empresas');
  if (!cs.length) return vazio('Nenhuma empresa cadastrada.');
  return tabela(['Empresa', 'Setor / Sede', 'Status', 'Avaliações', 'Cadastrada por', 'Ações'], cs.map(c => `<tr><td><a class="more" href="#/empresa/${esc(c.id)}">${esc(c.nome)}</a><div class="mut">${fmtData(c.criado_em)}</div></td><td>${esc(c.setor)}<div class="mut">${esc(c.sede)}</div></td><td>${bStatus(c.status)}</td><td>${c.avaliacoes}</td><td>${c.criador_email ? esc(c.criador_nome) + '<div class="mut">' + esc(c.criador_email) + '</div>' : '<span class="mut">Dados iniciais</span>'}</td>
  <td><div class="acts">${c.status == 'pendente' ? adminAction(`/api/admin/empresas/${encodeURIComponent(c.id)}`, 'PATCH', { status: 'aprovada' }, 'Empresa aprovada.', '', 'Aprovar', 'btn sm') : adminAction(`/api/admin/empresas/${encodeURIComponent(c.id)}`, 'PATCH', { status: 'pendente' }, 'Empresa ocultada (voltou para análise).', '', 'Ocultar')}
  <a class="btn sm o" href="#/admin-empresa/${esc(c.id)}">Editar</a>${adminAction(`/api/admin/empresas/${encodeURIComponent(c.id)}`, 'DELETE', null, 'Empresa excluída.', 'Excluir esta empresa e todas as avaliações dela? Isso não pode ser desfeito.', 'Excluir')}</div></td></tr>`))
}
async function admEditar(id) {
  if (!ME || ME.role != 'admin') return admin();
  const c = (await api('/api/admin/empresas')).find(x => x.id == id);
  if (!c) return `<div class="pg">Empresa não encontrada.</div>`;
  const portes = ['1 a 50', '51 a 200', '201 a 1.000', '1.001 a 5.000', '+5.000'];
  return `<div class="pg"><a class="more" href="#/admin" data-action="admin-back" data-mode="empresas">← Voltar ao painel</a><form class="card form" style="margin-top:16px" data-submit="company-edit" data-company-id="${esc(c.id)}"><h2>Editar empresa</h2>
  <label>Nome</label><input id="en" required maxlength="80" value="${esc(c.nome)}">
  <div class="row"><div><label>Setor</label><input id="es" required maxlength="60" value="${esc(c.setor)}"></div><div><label>Faixa de funcionários</label><select id="ep">${portes.map(p => `<option ${p == c.porte ? 'selected' : ''}>${p}</option>`).join('')}</select></div></div>
  <div class="row"><div><label>Sede</label><input id="ed" required maxlength="80" value="${esc(c.sede)}"></div><div><label>Selo / destaque</label><input id="et" required maxlength="60" value="${esc(c.tag)}"></div></div>
  <label>Descrição</label><textarea id="ex" rows="4" maxlength="500">${esc(c.desc)}</textarea>
  <label>Status</label><select id="est"><option value="aprovada" ${c.status == 'aprovada' ? 'selected' : ''}>Aprovada (visível para todos)</option><option value="pendente" ${c.status == 'pendente' ? 'selected' : ''}>Pendente (oculta)</option></select><br><br><button class="btn" style="width:100%">Salvar alterações</button></form></div>`
}
async function salvarEmp(e, id) {
  e.preventDefault();
  try { await api('/api/admin/empresas/' + encodeURIComponent(id), { method: 'PATCH', body: { nome: $('#en').value, setor: $('#es').value, porte: $('#ep').value, sede: $('#ed').value, tag: $('#et').value, desc: $('#ex').value, status: $('#est').value } }); toast('Empresa atualizada.'); ADM = 'empresas'; location.hash = '#/admin' } catch (err) { toast(err.message) }
  return false
}
async function admAvaliacoes() {
  const rs = await api('/api/admin/avaliacoes' + (ADMF != 'todos' ? '?status=' + ADMF : ''));
  const filtro = `<div style="margin-bottom:14px;max-width:260px"><select data-change="admin-review-filter"><option value="todos">Todas as avaliações</option><option value="pendente" ${ADMF == 'pendente' ? 'selected' : ''}>Só pendentes</option><option value="aprovada" ${ADMF == 'aprovada' ? 'selected' : ''}>Só aprovadas</option></select></div>`;
  if (!rs.length) return filtro + vazio('Nenhuma avaliação encontrada.');
  return filtro + tabela(['Empresa', 'Avaliação', 'Autor', 'Status', 'Ações'], rs.map(r => `<tr><td><a class="more" href="#/empresa/${esc(r.empresa_id)}">${esc(r.empresa)}</a><div class="mut">${fmtData(r.criado_em)}</div></td>
  <td style="min-width:280px"><b>${esc(r.titulo)}</b> ${stars(r.media)}<div class="mut" style="white-space:pre-line">${esc(r.texto.length > 220 ? r.texto.slice(0, 220) + '…' : r.texto)}</div></td>
  <td>${esc(r.nome)} · ${esc(r.cargo)}<div class="mut">${r.autor_email ? esc(r.autor_email) : 'Dados iniciais'}</div></td><td>${bStatus(r.status)}</td>
  <td><div class="acts">${r.status == 'pendente' ? adminAction(`/api/admin/avaliacoes/${r.id}`, 'PATCH', { status: 'aprovada' }, 'Avaliação aprovada.', '', 'Aprovar', 'btn sm') : adminAction(`/api/admin/avaliacoes/${r.id}`, 'PATCH', { status: 'pendente' }, 'Avaliação ocultada.', '', 'Ocultar')}
  ${adminAction(`/api/admin/avaliacoes/${r.id}`, 'DELETE', null, 'Avaliação excluída.', 'Excluir esta avaliação definitivamente?', 'Excluir')}</div></td></tr>`))
}
async function admUsuarios() {
  const us = await api('/api/admin/usuarios');
  return tabela(['Usuário', 'Perfil', 'Situação', 'Avaliações', 'Entrou em', 'Ações'], us.map(u => {
    const eu = u.id == ME.id;
    return `<tr><td>${esc(u.nome)}<div class="mut">${esc(u.email)}</div></td><td>${u.role == 'admin' ? '<span class="badge adm">Administrador</span>' : '<span class="badge">Usuário</span>'}</td><td>${u.bloqueado ? '<span class="badge pend">Bloqueado</span>' : '<span class="badge ok">Ativo</span>'}</td><td>${u.avaliacoes}</td><td>${fmtData(u.criado_em)}</td>
    <td>${eu ? '<span class="mut">Você</span>' : `<div class="acts">${adminAction(`/api/admin/usuarios/${u.id}`, 'PATCH', { role: u.role == 'admin' ? 'user' : 'admin' }, 'Perfil atualizado.', u.role == 'admin' ? 'Remover os poderes de administrador deste usuário?' : 'Tornar este usuário administrador? Ele terá acesso total ao painel.', u.role == 'admin' ? 'Tirar admin' : 'Tornar admin')}
    ${adminAction(`/api/admin/usuarios/${u.id}`, 'PATCH', { bloqueado: !u.bloqueado }, u.bloqueado ? 'Usuário desbloqueado.' : 'Usuário bloqueado.', '', u.bloqueado ? 'Desbloquear' : 'Bloquear')}
    ${adminAction(`/api/admin/usuarios/${u.id}`, 'DELETE', null, 'Usuário excluído.', 'Excluir esta conta? As avaliações dela continuam publicadas, sem vínculo com a conta.', 'Excluir')}</div>`}</td></tr>`
  }))
}
async function admContatos() {
  const cs = await api('/api/admin/contatos');
  if (!cs.length) return vazio('Nenhum contato B2B recebido ainda.');
  return tabela(['Empresa', 'E-mail', 'Plano', 'Data', ''], cs.map(c => `<tr><td>${esc(c.empresa)}</td><td><a class="more" href="mailto:${esc(c.email)}">${esc(c.email)}</a></td><td>${esc(c.plano)}</td><td>${fmtData(c.criado_em)}</td><td>${adminAction(`/api/admin/contatos/${c.id}`, 'DELETE', null, 'Contato removido.', 'Remover este contato da lista?', 'Remover')}</td></tr>`))
}

async function admMensagens() {
  const ms = await api('/api/admin/mensagens');
  if (!ms.length) return vazio('Nenhuma mensagem recebida ainda.');
  return tabela(['De', 'Assunto', 'Mensagem', 'Data', 'Ações'], ms.map(m => `<tr><td>${esc(m.nome)}<div class="mut">${esc(m.email)}</div>${m.lida ? '' : '<span class="badge pend">Nova</span>'}</td><td>${esc(m.assunto)}</td><td style="min-width:280px;white-space:pre-line">${esc(m.mensagem)}</td><td>${fmtData(m.criado_em)}</td>
  <td><div class="acts"><a class="btn sm" href="mailto:${esc(m.email)}?subject=${encodeURIComponent('Re: ' + m.assunto + ' - FeedWork')}">Responder</a>${adminAction(`/api/admin/mensagens/${m.id}`, 'PATCH', { lida: !m.lida }, m.lida ? 'Marcada como não lida.' : 'Marcada como lida.', '', m.lida ? 'Marcar não lida' : 'Marcar lida')}${adminAction(`/api/admin/mensagens/${m.id}`, 'DELETE', null, 'Mensagem excluída.', 'Excluir esta mensagem?', 'Excluir')}</div></td></tr>`))
}
async function admPalavras() {
  const ps = await api('/api/admin/palavras');
  return `<div class="card" style="margin-bottom:16px"><h3>Filtro de palavras</h3><p class="mut" style="margin:6px 0 12px">Textos com estas palavras são recusados no cadastro de conta, no cadastro de empresa e nas avaliações. Basta cadastrar a palavra <b>uma vez</b>: o filtro reconhece sozinho maiúsculas, acentos, letras repetidas (<i>puuuta</i>), números e símbolos no lugar de letras (<i>p0rra</i>, <i>m3rd@</i>), letras separadas (<i>p u t a</i>, <i>p.u.t.a</i>) e letras escondidas por símbolo (<i>p*ta</i>). Vale para a palavra inteira, então "computador" não é barrado por "puta". Para pegar também as derivadas, termine com <b>*</b> (ex.: <b>idiot*</b> bloqueia idiota, idiotice...). Administradores não são filtrados.</p>
  <form data-submit="keyword-add"><textarea id="pw" rows="3" required placeholder="Digite uma ou mais palavras, separadas por vírgula ou uma por linha"></textarea><br><br><button class="btn sm">Adicionar ao filtro</button></form></div>
  <div class="card"><b>${ps.length} palavra(s) bloqueada(s)</b> <span class="mut">(clique para remover)</span><div class="catbar" style="margin-top:12px">${ps.length ? ps.map(p => adminAction(`/api/admin/palavras/${p.id}`, 'DELETE', null, 'Palavra removida do filtro.', '', `${p.palavra} ✕`)).join('') : '<span class="mut">Nenhuma palavra cadastrada.</span>'}</div></div>`
}
async function addPalavras(e) {
  e.preventDefault();
  try { const r = await api('/api/admin/palavras', { body: { palavras: $('#pw').value } }); toast(r.adicionadas ? r.adicionadas + ' palavra(s) adicionada(s) ao filtro.' : 'Essas palavras já estavam no filtro.'); route(true) } catch (err) { toast(err.message) }
  return false
}

const DOCS_LEGAIS = {
  termos: {
    titulo: 'Termos de Uso',
    resumo: 'Regras para usar o FeedWork e participar da comunidade.',
    versao: 'draft-2026-11-v1',
    secoes: [
      ['Sobre o serviço', ['O FeedWork reúne informações sobre empresas, avaliações de experiências profissionais e ferramentas para comparar relatos. O conteúdo publicado por usuários representa a experiência de quem o enviou e não necessariamente a opinião do FeedWork.']],
      ['Conta, aceite e comunicações', ['Para criar uma conta, é necessário aceitar a versão dos Termos identificada nesta página. O aceite é registrado com versão, data e origem. A autorização para receber comunicações de marketing por e-mail é opcional, separada dos Termos e pode ser retirada nas configurações da conta. Você é responsável por proteger suas credenciais e pelas ações feitas na sua conta. Avise a administração se suspeitar de uso não autorizado.']],
      ['Conteúdo enviado', ['Envie apenas conteúdo que tenha direito de compartilhar. Não publique dados pessoais de terceiros, informações confidenciais, ameaças, assédio, spam ou afirmações deliberadamente falsas. Não use a plataforma para se passar por outra pessoa ou manipular avaliações.']],
      ['Moderação e disponibilidade', ['Empresas e avaliações podem ficar pendentes de análise, ser aprovadas, ocultadas ou removidas conforme as diretrizes. A plataforma pode alterar recursos ou suspender contas que violem estas regras. Informações e avaliações não são garantia de emprego, salário, promoção ou resultado profissional.']],
      ['Conta e conteúdo após exclusão', ['O autor pode excluir suas próprias avaliações. A exclusão de uma conta pelo administrador pode desvincular avaliações e empresas da identidade do usuário sem apagar automaticamente o conteúdo publicado. Para solicitar a remoção de conteúdo, use o formulário Contato.']],
      ['Contato e revisão', ['Dúvidas sobre estes termos podem ser enviadas pela página Contato. Este texto é um rascunho operacional e precisa ser revisado antes de representar os termos definitivos do serviço.']],
    ],
  },
  privacidade: {
    titulo: 'Política de Privacidade',
    resumo: 'Quais dados o sistema trata, para que são usados e como pedir ajuda.',
    secoes: [
      ['Dados de conta', ['O cadastro guarda nome, e-mail, data de criação, papel, estado da conta e histórico de aceite dos Termos e de consentimento para comunicações de marketing, com versão, origem e data. A preferência de marketing é opcional e pode ser retirada na conta. A senha não é guardada em texto puro: o sistema armazena um hash produzido com scrypt.']],
      ['Conteúdo e formulários', ['O sistema guarda empresas cadastradas e seus dados (nome, setor, sede, porte e descrição), avaliações (relação com a empresa, cargo, notas, título, comentário e opção de exibição), votos, mensagens do formulário Contato e solicitações B2B (empresa, e-mail e plano). Mensagens incluem nome, e-mail, assunto e texto.']],
      ['Sessões e cookies', ['Ao entrar, o navegador recebe o cookie fw_sess, essencial para manter a sessão; ele é HttpOnly, SameSite=Lax e tem validade de sete dias. O banco guarda o hash do token da sessão. O atributo Secure depende da configuração HTTPS da implantação. O servidor guarda eventos de tentativas com o endereço IP no SQLite para aplicar limites de uso e executa uma limpeza periódica que remove eventos com mais de 24 horas. A preferência entre cookies essenciais e cookies de marketing fica no localStorage deste navegador; ela é separada do consentimento para e-mails de marketing. A escolha de tema claro ou escuro (fw_tema) também fica apenas no localStorage deste navegador. Atualmente a aplicação não carrega recursos de terceiros, publicidade ou analytics. Qualquer integração de anúncios futura deverá verificar o consentimento antes de carregar scripts ou cookies.']],
      ['Visibilidade e acesso', ['Empresas e avaliações aprovadas podem ser exibidas publicamente. Avaliações são anônimas por padrão, mas a identidade do autor continua associada à conta e pode ser vista pela administração para operação e moderação. Administradores também podem acessar dados de contas, mensagens e contatos B2B. Senhas e e-mails de conta não são exibidos publicamente.']],
      ['Retenção e exclusão', ['Sessões expiradas são removidas periodicamente e eventos antigos de limite de tentativas são removidos por uma rotina periódica após 24 horas. Ao excluir uma conta, avaliações aprovadas são desvinculadas e passam a aparecer como “Anônimo”; avaliações pendentes e mensagens de Contato vinculadas à conta são apagadas. Empresas aprovadas permanecem publicadas sem vínculo com a conta; empresas pendentes sem avaliações de outras pessoas são removidas, enquanto as que tenham avaliações de terceiros permanecem sem vínculo com quem as cadastrou. Votos e sessões da conta são removidos. O sistema não tem prazo automático de retenção para os demais registros nem associa contatos B2B a uma conta.']],
      ['Solicitações de privacidade', ['A pessoa pode baixar uma cópia JSON dos dados associados à conta e solicitar a exclusão pela página Entrar, após autenticar-se. Para pedidos de acesso ou correção que não estejam disponíveis na interface, use a página Contato. A exclusão da conta não apaga avaliações aprovadas: elas são mantidas sem vínculo e anonimizadas para preservar o conteúdo da comunidade.']],
      ['Revisão deste texto', ['A identificação legal do operador, os dados do provedor de hospedagem, os prazos de retenção e o canal formal para solicitações precisam ser definidos antes da publicação definitiva. Este texto é um rascunho baseado no código atual, não uma certificação de conformidade legal.']],
    ],
  },
  anonimato: {
    titulo: 'Política de Anonimato',
    resumo: 'Como a opção anônima funciona nas avaliações do FeedWork.',
    secoes: [
      ['Padrão anônimo', ['As avaliações são anônimas por padrão. Quando essa opção é mantida, o público vê “Anônimo” no lugar do nome do autor. O autor pode mudar a exibição para mostrar o nome ou voltar ao anonimato depois de publicar.']],
      ['Limites do anonimato', ['Anonimato é uma forma de exibição pública, não uma separação técnica da conta: o sistema mantém a avaliação vinculada ao usuário para permitir que ele a altere ou exclua, impedir avaliações duplicadas e apoiar a moderação. Administradores autorizados podem consultar a identidade associada à avaliação.']],
      ['Cuidados ao escrever', ['Não inclua no título ou comentário detalhes que identifiquem você ou outras pessoas, como nomes, contatos, números de matrícula ou informações confidenciais. Mesmo com a opção anônima, detalhes do próprio relato podem revelar identidades.']],
      ['Controle da avaliação', ['O autor pode alternar entre exibir o nome e “Anônimo”, ou excluir a própria avaliação. O texto publicado não pode ser editado no momento. Avaliações também podem ser ocultadas ou removidas pela administração conforme as diretrizes de moderação.']],
    ],
  },
  diretrizes: {
    titulo: 'Diretrizes de Moderação',
    resumo: 'Critérios para manter relatos úteis, respeitosos e seguros.',
    secoes: [
      ['Relatos de experiência', ['Avaliações devem descrever experiências profissionais próprias, com contexto e linguagem respeitosa. Diferencie opinião de fato e evite generalizações que não consiga sustentar. O conteúdo é enviado pelo usuário e não é necessariamente verificado de forma independente.']],
      ['Privacidade e confidencialidade', ['Não publique dados pessoais de colegas, clientes ou gestores, nem documentos, credenciais, segredos comerciais ou conteúdo interno confidencial. Evite detalhes que identifiquem pessoas quando não forem necessários para entender a experiência.']],
      ['Conteúdo não permitido', ['Não são aceitos ameaças, assédio, discriminação, insultos, conteúdo ilegal, spam, publicidade disfarçada, avaliações coordenadas ou tentativas de manipular notas. O filtro automático de palavras é aplicado a nomes de conta, cadastros de empresas e avaliações; ele não substitui a análise humana e não é aplicado às mensagens de Contato ou aos contatos B2B.']],
      ['Análise e decisões', ['Por padrão, novos cadastros de empresa e avaliações de usuários ficam pendentes até análise administrativa. A configuração da implantação pode alterar esse comportamento. A administração pode aprovar, ocultar ou excluir conteúdo e bloquear contas em caso de violação.']],
      ['Como relatar um problema', ['Use a página Contato para informar conteúdo que pareça violar estas diretrizes. Inclua o endereço da página e uma descrição objetiva do problema, sem compartilhar dados sensíveis desnecessários.']],
    ],
  },
};

function paginaLegal(chave) {
  const doc = DOCS_LEGAIS[chave];
  return `<div class="pg legal-page"><a class="more" href="#/">← Voltar ao início</a>
  <div class="legal-heading"><div class="eyebrow">LEGAL &amp; PRIVACIDADE</div><span class="badge pend">Rascunho para revisão</span>${doc.versao ? `<span class="legal-version">Versão ${esc(doc.versao)}</span>` : ''}<h1>${esc(doc.titulo)}</h1><p class="mut">${esc(doc.resumo)}</p></div>
  <div class="note legal-draft">Este texto foi preparado com base no funcionamento atual do projeto. Antes de publicação definitiva, revise-o juridicamente e complete a identificação do operador, o contato de privacidade e os prazos de retenção.</div>
  <article class="legal-sections">${doc.secoes.map(([titulo, paragrafos]) => `<section class="legal-section"><h2>${esc(titulo)}</h2>${paragrafos.map(p => `<p>${esc(p)}</p>`).join('')}</section>`).join('')}</article>
  <nav class="legal-nav" aria-label="Outros documentos"><a href="#/termos">Termos</a><a href="#/privacidade">Privacidade</a><a href="#/anonimato">Anonimato</a><a href="#/diretrizes">Moderação</a></nav></div>`;
}

/* ===== Animações: revelar ao rolar, contagem dos números, transição de página ===== */
const REDUZ = matchMedia('(prefers-reduced-motion: reduce)').matches;
let IO = null;
function contarNumeros(raiz) {
  raiz.querySelectorAll('[data-n]').forEach(b => {
    const m = b.textContent.match(/^(\D*)([\d.]+)(\D*)$/); if (!m) return;
    const alvo = +m[2].replace(/\./g, ''), t0 = performance.now(), dur = 1400;
    const f = t => { const k = Math.min(1, (t - t0) / dur); b.textContent = m[1] + Math.round(alvo * (1 - Math.pow(1 - k, 3))).toLocaleString('pt-BR') + m[3]; if (k < 1) requestAnimationFrame(f) };
    requestAnimationFrame(f);
  });
}
function animar(raiz, instante) {
  const els = raiz.querySelectorAll('.rv');
  if (instante || REDUZ || !('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('vis')); return }
  if (!IO) IO = new IntersectionObserver(es => es.forEach(en => {
    if (!en.isIntersecting) return;
    en.target.classList.add('vis'); IO.unobserve(en.target); contarNumeros(en.target);
  }), { threshold: .15 });
  els.forEach(e => { e.style.setProperty('--d', (Array.prototype.indexOf.call(e.parentNode.children, e) % 4) * .09 + 's'); IO.observe(e) });
}

/* ===== Rotas ===== */
async function route(manter) {
  const [, p, id] = location.hash.slice(1).split('/');
  const eu = ++RT, y = window.scrollY;
  let html;
  try {
    const pag = { '': home, empresas, empresa: () => empresa(id), avaliar: () => avaliar(id), 'nova-empresa': novaEmpresa, b2b, contato, entrar, admin, 'admin-empresa': () => admEditar(id), termos: () => paginaLegal('termos'), privacidade: () => paginaLegal('privacidade'), anonimato: () => paginaLegal('anonimato'), diretrizes: () => paginaLegal('diretrizes') }[p || ''] || home;
    html = await pag();
  } catch (e) {
    html = `<div class="pg"><div class="card form"><h2>Ops!</h2><p class="mut">${esc(e.message || 'Não foi possível carregar esta página.')}</p><br><a class="btn" href="#/">Voltar ao início</a></div></div>`;
  }
  if (eu != RT) return;   // outra navegação começou enquanto esta carregava
  $('#app').innerHTML = html;
  document.body.classList.toggle('inner', !!p);
  const app = $('#app'); app.classList.remove('pin'); if (manter !== true) { void app.offsetWidth; app.classList.add('pin') }
  animar(app, manter === true);
  window.scrollTo(0, manter === true ? y : 0)
}
addEventListener('hashchange', () => { TAB = NEXTTAB || 'geral'; NEXTTAB = null; NE = null; route() });
document.addEventListener('click', (event) => {
  const control = event.target.closest('[data-action]');
  if (!control) return;
  switch (control.dataset.action) {
    case 'category': setCat(control.dataset.cat); break;
    case 'clear-filters': limparFiltros(); break;
    case 'ne-go': if (NE) { NE.etapa = control.dataset.etapa; route() } break;
    case 'company-tab': TAB = control.dataset.tab; route(true); break;
    case 'review-anon': alternarAnon(Number(control.dataset.id), control.dataset.anon === 'true'); break;
    case 'review-delete': excluirAv(Number(control.dataset.id)); break;
    case 'vote': votar(Number(control.dataset.id), control.dataset.vote); break;
    case 'export-data': exportarMeusDados(); break;
    case 'logout': sair(); break;
    case 'cookie-decline': salvarConsentimentoCookies(false); break;
    case 'cookie-marketing': salvarConsentimentoCookies(true); break;
    case 'cookie-preferences':
      $('#cookie-consent').hidden = false;
      $('#cookie-consent [data-action="cookie-decline"]').focus();
      break;
    case 'auth-mode': AUTH = control.dataset.mode; route(true); break;
    case 'admin-mode': ADM = control.dataset.mode; route(true); break;
    case 'admin-kpi':
      event.preventDefault();
      ADM = control.dataset.mode;
      route(true);
      break;
    case 'admin-back': ADM = control.dataset.mode; break;
    case 'admin-request': {
      const body = control.dataset.body ? JSON.parse(control.dataset.body) : null;
      adm(control.dataset.url, control.dataset.method, body, control.dataset.message, control.dataset.confirm);
      break;
    }
  }
});
document.addEventListener('submit', (event) => {
  const form = event.target.closest('form[data-submit]');
  if (!form) return;
  event.preventDefault();
  switch (form.dataset.submit) {
    case 'search': buscar(event); break;
    case 'company-search': Q = $('#q').value.trim(); route(); break;
    case 'review': enviarAv(event); break;
    case 'company-create': enviarEmp(event); break;
    case 'cnpj-buscar': buscarCnpj(event); break;
    case 'company-create-cnpj': enviarEmpCnpj(event); break;
    case 'b2b-contact': enviarContato(event); break;
    case 'contact': enviarMensagem(event); break;
    case 'password-change': trocarSenha(event); break;
    case 'account-delete': excluirMinhaConta(event); break;
    case 'register': registrar(event); break;
    case 'login': logar(event); break;
    case 'marketing-consent': atualizarConsentimentoMarketing(event); break;
    case 'company-edit': salvarEmp(event, form.dataset.companyId); break;
    case 'keyword-add': addPalavras(event); break;
  }
});
document.addEventListener('change', (event) => {
  const control = event.target.closest('[data-change]');
  if (!control) return;
  if (control.dataset.change === 'review-filter') {
    FIL[control.dataset.filter] = control.value;
    route(true);
  } else if (control.dataset.change === 'admin-review-filter') {
    ADMF = control.value;
    route(true);
  }
});
document.addEventListener('input', (event) => {
  const control = event.target.closest('[data-count-min]');
  if (control) contar(control, Number(control.dataset.countMin), Number(control.dataset.countMax), control.dataset.countOptional === 'true');
});
const COOKIE_CONSENT_VERSION = 2;
function lerConsentimentoCookies() {
  try {
    const salvo = localStorage.getItem('feedwork-cookie-consent');
    if (!salvo) return null;
    if (salvo === 'accepted' || salvo === 'essential-only') return { version: COOKIE_CONSENT_VERSION, essential: true, marketing: false };
    const preferencia = JSON.parse(salvo);
    return preferencia && preferencia.version === COOKIE_CONSENT_VERSION && preferencia.essential === true && typeof preferencia.marketing === 'boolean'
      ? preferencia
      : null;
  } catch (e) { return null }
}
function salvarConsentimentoCookies(marketing) {
  try {
    localStorage.setItem('feedwork-cookie-consent', JSON.stringify({
      version: COOKIE_CONSENT_VERSION,
      essential: true,
      marketing,
      recordedAt: new Date().toISOString(),
    }));
  } catch (e) { }
  $('#cookie-consent').hidden = true;
}
function marketingCookiesPermitidos() {
  return lerConsentimentoCookies()?.marketing === true;
}
function mostrarAvisoCookies() {
  $('#cookie-consent').hidden = Boolean(lerConsentimentoCookies());
}
mostrarAvisoCookies();
{ const ed = $('#edicao'); if (ed) ed.textContent = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) }
(async () => { try { ME = (await api('/api/auth/eu')).user } catch (e) { } setLogin(); route() })();

/* Máscara do campo de CNPJ (00.000.000/0000-00; aceita letras do CNPJ alfanumérico) */
document.addEventListener('input', (event) => {
  if (event.target.id === 'ncnpj') event.target.value = mascaraCnpj(event.target.value);
});

/* Estrelas da avaliação: mostra "4 de 5" ao lado das estrelas escolhidas */
const ROTULO_NOTA = { 1: 'Muito ruim', 2: 'Ruim', 3: 'Regular', 4: 'Bom', 5: 'Excelente' };
document.addEventListener('change', (event) => {
  const radio = event.target;
  if (!radio.matches || !radio.matches('.nstars input')) return;
  radio.closest('.nline').querySelector('.nval').innerHTML = `<b>${radio.value}</b>/5 · ${ROTULO_NOTA[radio.value]}`;
});
