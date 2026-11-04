// Mercado: notícias do setor, monitor de normas (leis, resoluções, portarias, PLs),
// agenda regulatória e indicadores.

import * as store from './store.js';
import * as A from './a11y.js';
import { ctx } from './ctx.js';
import { icon, toast, openDialog, subnav, emptyState, segmented } from './ui.js';
import { esc, normalize, relTime, dateShort, parseDayKey, dayKey, copyText, shareOrDownload, pad } from './util.js';
import { AGENDA, KEY_NORMS, TOPICS } from './content.js';
import { countNewNorms } from './views-ponto.js';

const NEWS_TOPICS = [
  { value: 'todos', label: 'Todos' },
  { value: 'veiculos', label: 'Veículos' },
  { value: 'imoveis', label: 'Imóveis' },
  { value: 'trillia', label: 'Trillia/B3' },
  { value: 'credito', label: 'Crédito' },
  { value: 'regulatorio', label: 'Regulatório' },
];

export function renderMercado(sub = 'noticias') {
  const newN = countNewNorms();
  const items = [
    { id: 'noticias', label: 'Notícias', icon: 'news' },
    { id: 'normas', label: 'Normas', icon: 'scale', badge: newN || '', badgeLabel: `${newN} novas` },
    { id: 'agenda', label: 'Agenda', icon: 'calendar' },
    { id: 'indicadores', label: 'Indicadores', icon: 'chart' },
  ];
  const body = sub === 'normas' ? normas() : sub === 'agenda' ? agenda() : sub === 'indicadores' ? indicadores() : noticias();
  const titles = { noticias: 'Notícias do mercado', normas: 'Monitor de normas', agenda: 'Agenda regulatória', indicadores: 'Indicadores' };
  return `
  <header class="page-head">
    <p class="eyebrow">Financiamento de veículos e imóveis</p>
    <h1 tabindex="-1">${titles[sub] || titles.noticias}</h1>
    ${feedMeta()}
  </header>
  ${subnav('mercado', items, sub)}
  ${body}`;
}

function feedMeta() {
  const f = ctx.feed;
  return `<div class="feed-meta">
    <p class="muted small">${ctx.feedLoading ? 'Atualizando…' : f?.updatedAt ? `Atualizado ${esc(relTime(f.updatedAt))} (${esc(dateShort(f.updatedAt))})` : 'Sem dados ainda'}${ctx.feedError ? ` · <span class="text-warn">${esc(ctx.feedError)}</span>` : ''}</p>
    <button type="button" class="btn btn-sm btn-ghost" data-act="feed-refresh" ${ctx.feedLoading ? 'disabled' : ''}>${icon('refresh')} Atualizar</button>
  </div>`;
}

function kwHits(text) {
  const t = normalize(text);
  return store.get().settings.keywords.filter((k) => k && t.includes(normalize(k)));
}

// ---------------- Notícias ----------------
function noticias() {
  const s = store.get();
  const all = ctx.feed?.news || [];
  const q = normalize(ctx.ui.newsQuery);
  let list = all;
  if (ctx.ui.newsTopic !== 'todos') list = list.filter((n) => n.topic === ctx.ui.newsTopic || (n.topics || []).includes(ctx.ui.newsTopic));
  if (ctx.ui.newsSaved) list = list.filter((n) => s.news.saved[n.id]);
  if (q) list = list.filter((n) => normalize(`${n.title} ${n.source} ${n.summary || ''}`).includes(q));

  return `
  <section aria-label="Filtros de notícias" class="filters">
    <label class="field search-field"><span class="visually-hidden">Buscar nas notícias</span>
      ${icon('search')}<input type="search" placeholder="Buscar nas notícias" value="${esc(ctx.ui.newsQuery)}" data-input="news-q" autocomplete="off">
    </label>
    ${segmented('news-topic', NEWS_TOPICS, ctx.ui.newsTopic, { label: 'Tema', act: 'news-topic' })}
    <label class="check-inline"><input type="checkbox" data-change="news-saved" ${ctx.ui.newsSaved ? 'checked' : ''}> Somente salvas</label>
  </section>
  <p class="visually-hidden" aria-live="polite">${list.length} notícias exibidas.</p>
  <h2 class="visually-hidden">Lista de notícias</h2>
  ${list.length ? `<ul class="news-list">${list.slice(0, 120).map((n) => newsItem(n)).join('')}</ul>` :
    emptyState('news', ctx.feedLoading ? 'Carregando…' : 'Nenhuma notícia encontrada', ctx.feed ? 'Ajuste o filtro ou atualize.' : 'O feed ainda não foi carregado.')}
  <section class="card" aria-labelledby="gn-t">
    <h2 id="gn-t">${icon('link')} Buscar agora no Google Notícias</h2>
    <p class="muted small">Para ver o que saiu nos últimos minutos, abra uma busca pronta:</p>
    <ul class="chip-links">${['financiamento de veículos', 'crédito imobiliário', 'Trillia B3', 'gravame', 'Renave', 'Marco Legal das Garantias', 'Resolução CMN', 'Resolução Contran'].map((t) => `<li><a href="https://news.google.com/search?q=${encodeURIComponent(t + ' when:7d')}&hl=pt-BR&gl=BR&ceid=BR:pt-419" target="_blank" rel="noopener">${esc(t)}</a></li>`).join('')}</ul>
  </section>`;
}

function newsItem(n) {
  const s = store.get();
  const read = s.news.read[n.id];
  const saved = s.news.saved[n.id];
  const hits = kwHits(n.title + ' ' + (n.summary || ''));
  return `<li class="news-item ${read ? 'read' : ''}">
    <article aria-labelledby="n-${esc(n.id)}">
      <p class="news-meta"><span class="tag t-${esc(n.topic)}">${esc(TOPICS[n.topic] || 'Geral')}</span> <span>${esc(n.source || '')}</span>${n.date ? ` · <time datetime="${esc(n.date)}">${esc(relTime(n.date))}</time>` : ''}${!read ? ' <span class="dot-new">não lida</span>' : ''}</p>
      <h3 id="n-${esc(n.id)}"><a href="${esc(n.url)}" target="_blank" rel="noopener" data-act="news-open" data-id="${esc(n.id)}">${esc(n.title)}<span class="visually-hidden"> (abre em nova aba)</span></a></h3>
      ${n.summary ? `<p class="news-sum">${esc(n.summary)}</p>` : ''}
      ${hits.length ? `<p class="kw">${icon('tag')} ${hits.slice(0, 3).map((h) => `<span>${esc(h)}</span>`).join('')}</p>` : ''}
      <div class="item-actions">
        <button type="button" class="btn btn-sm btn-ghost" data-act="speak-news" data-id="${esc(n.id)}">${icon('speaker')} Ouvir</button>
        <button type="button" class="btn btn-sm btn-ghost" data-act="news-save" data-id="${esc(n.id)}" aria-pressed="${saved ? 'true' : 'false'}">${icon(saved ? 'star-fill' : 'star')} ${saved ? 'Salva' : 'Salvar'}</button>
        <button type="button" class="btn btn-sm btn-ghost" data-act="share" data-url="${esc(n.url)}" data-title="${esc(n.title)}">${icon('share')} Compartilhar</button>
        <button type="button" class="btn btn-sm btn-ghost" data-act="news-read" data-id="${esc(n.id)}" aria-pressed="${read ? 'true' : 'false'}">${icon('check')} ${read ? 'Lida' : 'Marcar lida'}</button>
        <button type="button" class="btn btn-sm btn-ghost" data-act="news-task" data-id="${esc(n.id)}">${icon('plus')} Tarefa</button>
      </div>
    </article>
  </li>`;
}

// ---------------- Normas ----------------
const NORM_FILTERS = [
  { value: 'todas', label: 'Todas' },
  { value: 'novas', label: 'Novas' },
  { value: 'relevante', label: 'Relevantes' },
  { value: 'kw', label: 'Palavras-chave' },
  { value: 'pl', label: 'Projetos de lei' },
  { value: 'arquivada', label: 'Arquivadas' },
];

function normas() {
  const s = store.get();
  const all = (ctx.feed?.normas || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const f = ctx.ui.normsFilter;
  const q = normalize(ctx.ui.normsQuery);
  let list = all.filter((n) => (f === 'arquivada' ? s.norms.status[n.id] === 'arquivada' : s.norms.status[n.id] !== 'arquivada'));
  if (f === 'novas') list = list.filter((n) => !s.norms.seen[n.id] && !s.norms.status[n.id]);
  if (f === 'relevante') list = list.filter((n) => s.norms.status[n.id] === 'relevante');
  if (f === 'kw') list = list.filter((n) => kwHits(`${n.title} ${n.ementa || ''}`).length);
  if (f === 'pl') list = list.filter((n) => /^(PL|PLP|MPV|PEC|PDL)/i.test(n.kind || ''));
  if (q) list = list.filter((n) => normalize(`${n.kind} ${n.number} ${n.title} ${n.ementa || ''} ${n.source}`).includes(q));
  const newCount = countNewNorms();

  return `
  <section aria-label="Filtros de normas" class="filters">
    <label class="field search-field"><span class="visually-hidden">Buscar normas</span>
      ${icon('search')}<input type="search" placeholder="Buscar por número, órgão ou tema" value="${esc(ctx.ui.normsQuery)}" data-input="norms-q" autocomplete="off">
    </label>
    ${segmented('norms-f', NORM_FILTERS, f, { label: 'Filtro', act: 'norms-filter' })}
    ${newCount ? `<button type="button" class="btn btn-sm btn-ghost" data-act="norms-seen-all">${icon('check')} Marcar ${newCount} como vistas</button>` : ''}
  </section>
  <p class="visually-hidden" aria-live="polite">${list.length} normas exibidas.</p>
  <h2 class="visually-hidden">Lista de normas</h2>
  ${list.length ? `<ul class="norm-list">${list.slice(0, 150).map(normItem).join('')}</ul>` : emptyState('scale', 'Nada por aqui', f === 'novas' ? 'Você está em dia com as normas.' : 'Ajuste o filtro ou atualize o monitor.')}

  <section class="card" aria-labelledby="kn-t">
    <h2 id="kn-t">${icon('book')} Normas de referência</h2>
    <ul class="ref-list">${KEY_NORMS.map((n) => `<li><a href="${esc(n.url)}" target="_blank" rel="noopener"><strong>${esc(n.kind)} ${esc(n.number)}</strong> — ${esc(n.title)}</a> <span class="tag t-${esc(n.topic)}">${esc(TOPICS[n.topic])}</span></li>`).join('')}</ul>
  </section>

  <section class="card" aria-labelledby="kw-t">
    <h2 id="kw-t">${icon('tag')} Minhas palavras-chave</h2>
    <p class="muted small">Itens com estas palavras ganham destaque. O robô que atualiza o feed usa a lista do arquivo <code>config/monitor.json</code>.</p>
    <ul class="kw-edit">${s.settings.keywords.map((k, i) => `<li><span>${esc(k)}</span><button type="button" class="icon-btn sm" data-act="kw-del" data-i="${i}" aria-label="Remover palavra-chave ${esc(k)}">${icon('x')}</button></li>`).join('')}</ul>
    <form class="input-row" data-form="kw-add">
      <label class="visually-hidden" for="kw-new">Nova palavra-chave</label>
      <input id="kw-new" name="kw" type="text" placeholder="Ex.: cessão fiduciária" maxlength="40" required>
      <button type="submit" class="btn btn-ghost">${icon('plus')} Adicionar</button>
    </form>
  </section>`;
}

function normItem(n) {
  const s = store.get();
  const st = s.norms.status[n.id];
  const isNew = !s.norms.seen[n.id] && !st;
  const hits = kwHits(`${n.title} ${n.ementa || ''}`);
  const note = s.norms.notes[n.id];
  return `<li class="norm-item ${isNew ? 'is-new' : ''}">
    <article aria-labelledby="nm-${esc(n.id)}">
      <p class="news-meta">
        <span class="tag tag-kind">${esc(n.kind || 'Ato')}</span>
        <span>${esc(n.source || '')}</span>${n.date ? ` · <time datetime="${esc(n.date)}">${esc(dateShort(n.date))}</time>` : ''}
        ${n.topic ? `<span class="tag t-${esc(n.topic)}">${esc(TOPICS[n.topic] || n.topic)}</span>` : ''}
        ${isNew ? '<span class="dot-new">nova</span>' : ''}
      </p>
      <h3 id="nm-${esc(n.id)}"><a href="${esc(n.url)}" target="_blank" rel="noopener" data-act="norm-open" data-id="${esc(n.id)}">${n.number ? `${esc(n.kind)} nº ${esc(n.number)} — ` : ''}${esc(n.title)}<span class="visually-hidden"> (abre em nova aba)</span></a></h3>
      ${n.ementa && n.ementa !== n.title ? `<p class="news-sum">${esc(n.ementa)}</p>` : ''}
      ${n.status ? `<p class="muted small">Situação: ${esc(n.status)}</p>` : ''}
      ${hits.length ? `<p class="kw">${icon('tag')} ${hits.slice(0, 4).map((h) => `<span>${esc(h)}</span>`).join('')}</p>` : ''}
      ${note ? `<p class="my-note">${icon('edit')} ${esc(note)}</p>` : ''}
      <div class="item-actions">
        <button type="button" class="btn btn-sm btn-ghost" data-act="norm-status" data-id="${esc(n.id)}" data-st="relevante" aria-pressed="${st === 'relevante'}">${icon(st === 'relevante' ? 'star-fill' : 'star')} Relevante</button>
        <button type="button" class="btn btn-sm btn-ghost" data-act="norm-note" data-id="${esc(n.id)}">${icon('edit')} Nota</button>
        <button type="button" class="btn btn-sm btn-ghost" data-act="speak-norm" data-id="${esc(n.id)}">${icon('speaker')} Ouvir</button>
        <button type="button" class="btn btn-sm btn-ghost" data-act="norm-task" data-id="${esc(n.id)}">${icon('plus')} Tarefa</button>
        ${isNew ? `<button type="button" class="btn btn-sm btn-ghost" data-act="norm-seen" data-id="${esc(n.id)}">${icon('check')} Vista</button>` : ''}
        <button type="button" class="btn btn-sm btn-ghost" data-act="norm-status" data-id="${esc(n.id)}" data-st="arquivada" aria-pressed="${st === 'arquivada'}">${icon('archive')} ${st === 'arquivada' ? 'Desarquivar' : 'Arquivar'}</button>
      </div>
    </article>
  </li>`;
}

// ---------------- Agenda ----------------
function agenda() {
  const today = dayKey();
  const items = [...AGENDA, ...(ctx.feed?.agenda || [])]
    .filter((a, i, arr) => arr.findIndex((x) => x.date === a.date && x.title === a.title) === i)
    .sort((a, b) => a.date.localeCompare(b.date));
  const next = items.filter((a) => a.date >= today);
  const past = items.filter((a) => a.date < today).reverse();
  const row = (a, i) => {
    const days = Math.round((parseDayKey(a.date) - parseDayKey(today)) / 86400000);
    const when = days === 0 ? 'hoje' : days === 1 ? 'amanhã' : days > 0 ? `em ${days} dias` : `há ${-days} dias`;
    return `<li class="agenda-item ${days >= 0 && days <= 7 ? 'soon' : ''}">
      <div class="ag-date" aria-hidden="true"><span>${parseDayKey(a.date).getDate()}</span><small>${parseDayKey(a.date).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</small></div>
      <div class="ag-body">
        <p><strong>${esc(a.title)}</strong></p>
        <p class="muted small"><span class="visually-hidden">${esc(dateShort(parseDayKey(a.date)))}, </span>${esc(when)} · ${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.source)}</a>` : esc(a.source)}</p>
        ${days >= 0 ? `<button type="button" class="btn btn-sm btn-ghost" data-act="agenda-ics" data-i="${i}">${icon('bell')} Lembrete no calendário</button>` : ''}
      </div></li>`;
  };
  ctx.ui.agendaItems = items;
  return `
  <section class="card" aria-labelledby="ag-t">
    <h2 id="ag-t">${icon('calendar')} Próximos marcos</h2>
    ${next.length ? `<ol class="agenda">${next.map((a) => row(a, items.indexOf(a))).join('')}</ol>` : '<p class="muted">Sem datas futuras cadastradas.</p>'}
  </section>
  ${past.length ? `<details class="card"><summary><h2>${icon('archive')} Marcos passados (${past.length})</h2></summary><ol class="agenda">${past.map((a) => row(a, items.indexOf(a))).join('')}</ol></details>` : ''}
  <p class="muted small">Datas extraídas dos atos oficiais. Confirme sempre no texto publicado no Diário Oficial.</p>`;
}

export function agendaICS(i) {
  const a = (ctx.ui.agendaItems || [])[i];
  if (!a) return;
  const ymd = a.date.replace(/-/g, '');
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rotina Trillia//Agenda//PT-BR', 'BEGIN:VEVENT',
    `UID:agenda-${ymd}-${i}@rotina-trillia`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd}`,
    `SUMMARY:${a.title.replace(/[,;]/g, ' ')}`, `DESCRIPTION:${(a.source || '').replace(/[,;]/g, ' ')} ${a.url || ''}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Marco regulatório', 'TRIGGER:-P1D', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  shareOrDownload(`marco-${a.date}.ics`, ics, 'text/calendar');
}

// ---------------- Indicadores ----------------
function indicadores() {
  const list = ctx.feed?.indicadores || [];
  return `
  ${list.length ? `<ul class="ind-grid">${list.map((i) => `<li class="ind">
    <p class="ind-label">${esc(i.label)}</p>
    <p class="ind-value">${esc(i.value)}<small>${esc(i.unit || '')}</small></p>
    <p class="muted small">${i.date ? `Ref. ${esc(i.date)}` : ''}${i.url ? ` · <a href="${esc(i.url)}" target="_blank" rel="noopener">fonte</a>` : ''}</p>
  </li>`).join('')}</ul>` : emptyState('chart', 'Indicadores ainda não carregados', 'Eles chegam com a próxima atualização automática do feed (Banco Central – SGS).')}
  <section class="card"><h2>${icon('info')} Sobre os dados</h2>
  <p class="muted small">Séries do Sistema Gerenciador de Séries Temporais do Banco Central, atualizadas pelo robô do app várias vezes ao dia. Taxas médias de veículos e imobiliário são de pessoas físicas.</p>
  ${ctx.feed?.fontes ? `<h3>Status das fontes na última verificação${ctx.feed.checkedAt ? ` (${esc(relTime(ctx.feed.checkedAt))})` : ''}</h3>
  <ul class="dist-list">${Object.entries(ctx.feed.fontes).map(([k, v]) => `<li><span>${esc(k)}</span><span class="${/erro/.test(v) ? 'text-warn' : 'muted'}">${esc(v)}</span></li>`).join('')}</ul>` : ''}</section>`;
}

// ---------------- Ações ----------------
export function findNews(id) { return (ctx.feed?.news || []).find((n) => n.id === id); }
export function findNorm(id) { return (ctx.feed?.normas || []).find((n) => n.id === id); }

export async function normNoteDialog(id) {
  const n = findNorm(id);
  if (!n) return;
  const cur = store.get().norms.notes[id] || '';
  const r = await openDialog({
    title: 'Nota sobre a norma',
    body: `<p class="muted">${esc(n.kind)} ${esc(n.number || '')} — ${esc(n.title)}</p>
      <form data-dialog-form class="form">
        <label class="field"><span>Sua nota (impacto, prazos, quem avisar…)</span><textarea name="note" rows="5" autofocus>${esc(cur)}</textarea></label>
        <div class="dlg-actions"><button type="submit" class="btn btn-primary">${icon('check')} Salvar</button></div>
      </form>`,
  });
  if (!r) return;
  store.update((s) => { if (r.note.trim()) s.norms.notes[id] = r.note.trim(); else delete s.norms.notes[id]; s.norms.seen[id] = true; });
  toast('Nota salva.', { kind: 'ok' });
  ctx.render();
}

export async function share(url, title) {
  try {
    if (navigator.share) { await navigator.share({ url, title }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const ok = await copyText(`${title}\n${url}`);
  toast(ok ? 'Link copiado.' : 'Não foi possível copiar.', { kind: ok ? 'ok' : 'error' });
}

export function speakItem(item) {
  if (!item) return;
  if (A.speaking()) { A.stopSpeaking(); return; }
  const text = `${item.kind ? item.kind + ' ' + (item.number || '') + '. ' : ''}${item.title}. ${item.ementa || item.summary || ''} ${item.source ? 'Fonte: ' + item.source + '.' : ''}`;
  A.speak(text);
}
