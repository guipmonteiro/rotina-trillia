// Trabalho: tarefas, notas (com ditado e leitura em voz alta), foco, calculadora de
// financiamento, glossário do mercado e fontes oficiais.

import * as store from './store.js';
import * as A from './a11y.js';
import { ctx } from './ctx.js';
import { icon, toast, openDialog, confirmDialog, subnav, emptyState, segmented } from './ui.js';
import { esc, dayKey, dateShort, parseDayKey, normalize, relTime, copyText, announce, pad } from './util.js';
import { GLOSSARY, SOURCES } from './content.js';

export const TAGS = ['Geral', 'Veículos', 'Imóveis', 'Regulatório', 'Reunião', 'Dados/Analytics', 'Cliente'];

export function renderTrabalho(sub = 'tarefas') {
  const s = store.get();
  const open = s.tasks.filter((t) => t.status !== 'done').length;
  const items = [
    { id: 'tarefas', label: 'Tarefas', icon: 'check', badge: open || '', badgeLabel: `${open} abertas` },
    { id: 'notas', label: 'Notas', icon: 'edit' },
    { id: 'foco', label: 'Foco', icon: 'timer' },
    { id: 'calculadora', label: 'Simulador', icon: 'calc' },
    { id: 'glossario', label: 'Glossário', icon: 'book' },
    { id: 'fontes', label: 'Fontes', icon: 'link' },
  ];
  const titles = { tarefas: 'Tarefas', notas: 'Notas', foco: 'Foco', calculadora: 'Simulador de financiamento', glossario: 'Glossário do mercado', fontes: 'Fontes oficiais' };
  const body = { tarefas, notas, foco, calculadora, glossario, fontes }[sub] || tarefas;
  return `
  <header class="page-head">
    <p class="eyebrow">Apoio ao trabalho</p>
    <h1 tabindex="-1">${titles[sub] || titles.tarefas}</h1>
  </header>
  ${subnav('trabalho', items, sub)}
  ${body()}`;
}

// ---------------- Tarefas ----------------
function tarefas() {
  const s = store.get();
  const today = dayKey();
  const open = s.tasks.filter((t) => t.status !== 'done');
  const groups = [
    { id: 'late', label: 'Atrasadas', items: open.filter((t) => t.due && t.due < today) },
    { id: 'today', label: 'Hoje', items: open.filter((t) => t.due === today) },
    { id: 'next', label: 'Próximas', items: open.filter((t) => t.due && t.due > today).sort((a, b) => a.due.localeCompare(b.due)) },
    { id: 'nodate', label: 'Sem data', items: open.filter((t) => !t.due) },
  ];
  const done = s.tasks.filter((t) => t.status === 'done');
  return `
  <section class="card" aria-labelledby="nt-t">
    <h2 id="nt-t" class="visually-hidden">Nova tarefa</h2>
    <form class="form" data-form="task-add">
      <div class="input-row">
        <label class="visually-hidden" for="task-title">Nova tarefa</label>
        <input id="task-title" name="title" type="text" placeholder="Nova tarefa…" required maxlength="140" autocomplete="off">
        ${A.dictationSupported() ? `<button type="button" class="icon-btn" data-act="dictate-into" data-target="task-title" aria-label="Ditar tarefa">${icon('mic')}</button>` : ''}
        <button type="submit" class="btn btn-primary">${icon('plus')}<span class="visually-hidden">Adicionar</span></button>
      </div>
      <div class="grid-3">
        <label class="field"><span>Prazo</span><input type="date" name="due"></label>
        <label class="field"><span>Prioridade</span><select name="priority"><option value="normal">Normal</option><option value="alta">Alta</option><option value="baixa">Baixa</option></select></label>
        <label class="field"><span>Tema</span><select name="tag">${TAGS.map((t) => `<option>${esc(t)}</option>`).join('')}</select></label>
      </div>
    </form>
  </section>
  ${open.length ? groups.filter((g) => g.items.length).map((g) => `
    <section class="card" aria-labelledby="tg-${g.id}">
      <h2 id="tg-${g.id}" class="${g.id === 'late' ? 'text-danger' : ''}">${esc(g.label)} <span class="count">${g.items.length}</span></h2>
      <ul class="task-list">${g.items.map(taskItem).join('')}</ul>
    </section>`).join('') : emptyState('check', 'Nenhuma tarefa aberta', 'Adicione acima ou crie a partir de uma notícia ou norma.')}
  ${done.length ? `<details class="card"><summary><h2>Concluídas (${done.length})</h2></summary>
    <ul class="task-list">${done.slice(0, 50).map(taskItem).join('')}</ul>
    <button type="button" class="btn btn-sm btn-ghost" data-act="tasks-clear-done">${icon('trash')} Limpar concluídas</button></details>` : ''}`;
}

function taskItem(t) {
  const today = dayKey();
  const pr = t.priority === 'alta' ? '<span class="tag tag-danger">Alta</span>' : t.priority === 'baixa' ? '<span class="tag">Baixa</span>' : '';
  return `<li class="task ${t.status === 'done' ? 'done' : ''}">
    <input type="checkbox" id="tk-${t.id}" data-change="task-toggle" data-id="${t.id}" ${t.status === 'done' ? 'checked' : ''}>
    <label for="tk-${t.id}" class="task-body">
      <span class="task-title">${esc(t.title)}</span>
      <span class="task-meta">${pr}${t.tag ? `<span class="tag">${esc(t.tag)}</span>` : ''}${t.due ? `<span class="${t.due < today && t.status !== 'done' ? 'text-danger' : 'muted'}">${icon('calendar')} ${esc(dateShort(parseDayKey(t.due)))}</span>` : ''}${t.link ? `<a href="${esc(t.link)}" target="_blank" rel="noopener">${icon('link')} fonte</a>` : ''}</span>
      ${t.notes ? `<span class="task-notes">${esc(t.notes)}</span>` : ''}
    </label>
    <button type="button" class="icon-btn" data-act="task-edit" data-id="${t.id}" aria-label="Editar tarefa ${esc(t.title)}">${icon('edit')}</button>
  </li>`;
}

export async function taskDialog(id, preset) {
  const s = store.get();
  const t = id ? s.tasks.find((x) => x.id === id) : preset;
  const r = await openDialog({
    title: id ? 'Editar tarefa' : 'Nova tarefa',
    body: `<form data-dialog-form class="form">
      <label class="field"><span>Título</span><input name="title" required maxlength="140" value="${esc(t?.title || '')}" autofocus></label>
      <label class="field"><span>Detalhes</span><textarea name="notes" rows="3">${esc(t?.notes || '')}</textarea></label>
      <div class="grid-3">
        <label class="field"><span>Prazo</span><input type="date" name="due" value="${esc(t?.due || '')}"></label>
        <label class="field"><span>Prioridade</span><select name="priority">${['normal', 'alta', 'baixa'].map((p) => `<option value="${p}" ${t?.priority === p ? 'selected' : ''}>${p[0].toUpperCase() + p.slice(1)}</option>`).join('')}</select></label>
        <label class="field"><span>Tema</span><select name="tag">${TAGS.map((x) => `<option ${t?.tag === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
      </div>
      <div class="dlg-actions">
        ${id ? `<button type="submit" class="btn btn-danger-ghost" data-value="delete" formnovalidate>${icon('trash')} Excluir</button>` : ''}
        <button type="submit" class="btn btn-primary" data-value="save">${icon('check')} Salvar</button>
      </div></form>`,
  });
  if (!r) return;
  if (r._action === 'delete') {
    store.update((st) => { st.tasks = st.tasks.filter((x) => x.id !== id); });
    toast('Tarefa excluída.');
  } else if (id) {
    store.update((st) => { Object.assign(st.tasks.find((x) => x.id === id), { title: r.title, notes: r.notes, due: r.due, priority: r.priority, tag: r.tag }); });
    toast('Tarefa atualizada.', { kind: 'ok' });
  } else {
    const task = store.addTask({ ...r });
    if (preset?.link) store.update((st) => { st.tasks.find((x) => x.id === task.id).link = preset.link; });
    toast('Tarefa criada.', { kind: 'ok' });
  }
  ctx.render();
}

// ---------------- Notas ----------------
function notas() {
  const s = store.get();
  const list = s.notes.slice().sort((a, b) => (b.pinned - a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
  return `
  <div class="row-btns"><button type="button" class="btn btn-primary" data-act="note-new">${icon('plus')} Nova nota</button></div>
  ${list.length ? `<ul class="note-grid">${list.map((n) => `<li class="note ${n.pinned ? 'pinned' : ''}">
    <button type="button" class="note-open" data-act="note-open" data-id="${n.id}">
      <span class="note-title">${n.pinned ? icon('pin', { label: 'Fixada' }) : ''} ${esc(n.title)}</span>
      <span class="note-body">${esc(n.body.slice(0, 180))}${n.body.length > 180 ? '…' : ''}</span>
      <span class="muted small">Editada ${esc(relTime(n.updatedAt))}</span>
    </button></li>`).join('')}</ul>` : emptyState('edit', 'Nenhuma nota', 'Registre pautas de reunião, ideias e pendências. Dá para ditar por voz.')}`;
}

export async function noteDialog(id) {
  const s = store.get();
  const n = id ? s.notes.find((x) => x.id === id) : null;
  let rec = null;
  const r = await openDialog({
    title: n ? 'Nota' : 'Nova nota',
    wide: true,
    body: `<form data-dialog-form class="form">
      <label class="field"><span>Título</span><input name="title" id="note-title" maxlength="80" value="${esc(n?.title || '')}" ${n ? '' : 'autofocus'}></label>
      <label class="field"><span>Texto</span><textarea name="body" id="note-body" rows="10">${esc(n?.body || '')}</textarea></label>
      <div class="row-btns">
        ${A.dictationSupported() ? `<button type="button" class="btn btn-sm btn-ghost" id="note-mic" aria-pressed="false">${icon('mic')} Ditar</button>` : '<span class="muted small">Para ditar, use o microfone do teclado do celular.</span>'}
        <button type="button" class="btn btn-sm btn-ghost" id="note-speak">${icon('speaker')} Ouvir</button>
        <button type="button" class="btn btn-sm btn-ghost" id="note-copy">${icon('copy')} Copiar</button>
        <label class="check-inline"><input type="checkbox" name="pinned" value="1" ${n?.pinned ? 'checked' : ''}> Fixar no topo</label>
      </div>
      <div class="dlg-actions">
        ${n ? `<button type="submit" class="btn btn-danger-ghost" data-value="delete" formnovalidate>${icon('trash')} Excluir</button>` : ''}
        <button type="submit" class="btn btn-primary" data-value="save">${icon('check')} Salvar</button>
      </div></form>`,
    onOpen: (dlg) => {
      const body = dlg.querySelector('#note-body');
      const mic = dlg.querySelector('#note-mic');
      if (mic) mic.addEventListener('click', () => {
        if (rec) { rec.stop(); rec = null; mic.setAttribute('aria-pressed', 'false'); announce('Ditado encerrado.'); return; }
        rec = A.dictate((t) => { body.value += (body.value && !body.value.endsWith(' ') ? ' ' : '') + t; },
          () => { rec = null; mic.setAttribute('aria-pressed', 'false'); });
        if (rec) { mic.setAttribute('aria-pressed', 'true'); announce('Ditado iniciado. Fale agora.'); }
      });
      dlg.querySelector('#note-speak').addEventListener('click', () => {
        if (A.speaking()) A.stopSpeaking(); else A.speak(`${dlg.querySelector('#note-title').value}. ${body.value}`);
      });
      dlg.querySelector('#note-copy').addEventListener('click', async () => {
        const ok = await copyText(`${dlg.querySelector('#note-title').value}\n\n${body.value}`);
        announce(ok ? 'Nota copiada.' : 'Não foi possível copiar.');
      });
    },
  });
  if (rec) rec.stop();
  A.stopSpeaking();
  if (!r) return;
  if (r._action === 'delete') {
    if (await confirmDialog('Excluir nota?', `"${n.title}" será apagada.`, { ok: 'Excluir', danger: true })) {
      store.update((st) => { st.notes = st.notes.filter((x) => x.id !== id); });
      toast('Nota excluída.');
    }
  } else if (n) {
    store.update((st) => { Object.assign(st.notes.find((x) => x.id === id), { title: r.title || 'Sem título', body: r.body, pinned: !!r.pinned, updatedAt: new Date().toISOString() }); });
    toast('Nota salva.', { kind: 'ok' });
  } else if (r.title || r.body) {
    const note = store.addNote({ title: r.title, body: r.body });
    if (r.pinned) store.update((st) => { st.notes.find((x) => x.id === note.id).pinned = true; });
    toast('Nota criada.', { kind: 'ok' });
  }
  ctx.render();
}

// ---------------- Foco (pomodoro) ----------------
function foco() {
  const f = ctx.ui.focus;
  const rem = f.running ? Math.max(0, Math.round((f.endsAt - Date.now()) / 1000)) : f.remaining;
  return `
  <section class="card focus-card" aria-labelledby="fc-t">
    <h2 id="fc-t">${f.mode === 'foco' ? 'Bloco de foco' : 'Pausa'}</h2>
    <p class="focus-time" data-tick="focus" aria-hidden="true">${pad(Math.floor(rem / 60))}:${pad(rem % 60)}</p>
    <p class="visually-hidden" aria-live="off" data-tick="focus-sr">${Math.ceil(rem / 60)} minutos restantes</p>
    <div class="row-btns center">
      <button type="button" class="btn btn-primary btn-lg" data-act="focus-toggle">${icon(f.running ? 'pause' : 'play')} ${f.running ? 'Pausar' : 'Iniciar'}</button>
      <button type="button" class="btn btn-ghost" data-act="focus-reset">${icon('refresh')} Reiniciar</button>
      <button type="button" class="btn btn-ghost" data-act="focus-skip">Pular para ${f.mode === 'foco' ? 'pausa' : 'foco'}</button>
    </div>
    <p class="muted small center">Ciclos concluídos hoje: <strong>${f.cycles}</strong></p>
    <div class="grid-2">
      <label class="field"><span>Foco (min)</span><input type="number" min="5" max="120" value="${f.focusMin}" data-change="focus-min"></label>
      <label class="field"><span>Pausa (min)</span><input type="number" min="1" max="60" value="${f.breakMin}" data-change="break-min"></label>
    </div>
    <p class="hint">Ao terminar cada bloco você recebe aviso sonoro, vibração e anúncio para leitor de tela.</p>
  </section>`;
}

export function focusTick() {
  const f = ctx.ui.focus;
  if (!f.running) return;
  const rem = Math.max(0, Math.round((f.endsAt - Date.now()) / 1000));
  const el = document.querySelector('[data-tick="focus"]');
  if (el) el.textContent = `${pad(Math.floor(rem / 60))}:${pad(rem % 60)}`;
  const sr = document.querySelector('[data-tick="focus-sr"]');
  if (sr) sr.textContent = `${Math.ceil(rem / 60)} minutos restantes`;
  if (rem <= 0) {
    if (f.mode === 'foco') f.cycles++;
    f.mode = f.mode === 'foco' ? 'pausa' : 'foco';
    f.remaining = (f.mode === 'foco' ? f.focusMin : f.breakMin) * 60;
    f.endsAt = Date.now() + f.remaining * 1000;
    A.beep('ok'); A.haptic([200, 100, 200]);
    const msg = f.mode === 'pausa' ? 'Bloco de foco concluído. Hora de uma pausa.' : 'Pausa encerrada. De volta ao foco.';
    toast(msg, { kind: 'ok' });
    import('./views-ponto.js').then((m) => m.notify('Foco', msg, 'foco'));
    ctx.render();
  }
}

// ---------------- Simulador ----------------
function calculadora() {
  const c = ctx.ui.calc || { valor: 120000, entrada: 30000, taxa: 1.79, taxaTipo: 'am', prazo: 48, sistema: 'price' };
  ctx.ui.calc = c;
  const res = simulate(c);
  return `
  <section class="card" aria-labelledby="sim-t">
    <h2 id="sim-t" class="visually-hidden">Parâmetros</h2>
    <form class="form" data-form="calc">
      <div class="grid-2">
        <label class="field"><span>Valor do bem (R$)</span><input type="number" name="valor" min="0" step="100" value="${c.valor}" inputmode="decimal" required></label>
        <label class="field"><span>Entrada (R$)</span><input type="number" name="entrada" min="0" step="100" value="${c.entrada}" inputmode="decimal"></label>
        <label class="field"><span>Taxa de juros (%)</span><input type="number" name="taxa" min="0" step="0.01" value="${c.taxa}" inputmode="decimal" required></label>
        <label class="field"><span>Taxa ao</span><select name="taxaTipo"><option value="am" ${c.taxaTipo === 'am' ? 'selected' : ''}>mês</option><option value="aa" ${c.taxaTipo === 'aa' ? 'selected' : ''}>ano</option></select></label>
        <label class="field"><span>Prazo (meses)</span><input type="number" name="prazo" min="1" max="480" value="${c.prazo}" inputmode="numeric" required></label>
        <fieldset class="fieldset"><legend>Sistema</legend>${segmented('sistema', [{ value: 'price', label: 'Price' }, { value: 'sac', label: 'SAC' }], c.sistema, { label: 'Sistema de amortização' })}</fieldset>
      </div>
      <button type="submit" class="btn btn-primary">${icon('calc')} Calcular</button>
    </form>
  </section>
  ${res ? `
  <section class="card" aria-labelledby="sr-t" aria-live="polite">
    <h2 id="sr-t">Resultado</h2>
    <dl class="stats">
      <div><dt>Valor financiado</dt><dd>${brl(res.pv)}</dd></div>
      <div><dt>Cota financiada (LTV)</dt><dd>${(res.ltv * 100).toFixed(1).replace('.', ',')}%</dd></div>
      <div><dt>${c.sistema === 'price' ? 'Parcela' : '1ª parcela'}</dt><dd>${brl(res.first)}</dd></div>
      ${c.sistema === 'sac' ? `<div><dt>Última parcela</dt><dd>${brl(res.last)}</dd></div>` : ''}
      <div><dt>Total pago</dt><dd>${brl(res.total)}</dd></div>
      <div><dt>Juros totais</dt><dd>${brl(res.juros)}</dd></div>
      <div><dt>Taxa equivalente</dt><dd>${(res.im * 100).toFixed(2).replace('.', ',')}% a.m. · ${(res.ia * 100).toFixed(2).replace('.', ',')}% a.a.</dd></div>
    </dl>
    <details><summary>Ver tabela de amortização (${res.rows.length} parcelas)</summary>
      <div class="table-wrap"><table class="table">
        <caption class="visually-hidden">Tabela de amortização</caption>
        <thead><tr><th scope="col">Nº</th><th scope="col">Parcela</th><th scope="col">Juros</th><th scope="col">Amortização</th><th scope="col">Saldo</th></tr></thead>
        <tbody>${res.rows.map((r) => `<tr><th scope="row">${r.n}</th><td>${brl(r.pmt)}</td><td>${brl(r.j)}</td><td>${brl(r.a)}</td><td>${brl(r.saldo)}</td></tr>`).join('')}</tbody>
      </table></div>
    </details>
    <p class="muted small">Simulação sem tarifas, IOF, seguros e correção monetária (TR/IPCA). Não equivale ao CET.</p>
  </section>` : ''}`;
}

const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function simulate(c) {
  const pv = Math.max(0, Number(c.valor) - Number(c.entrada || 0));
  const n = Math.max(1, Math.round(Number(c.prazo)));
  const t = Number(c.taxa) / 100;
  if (!pv || Number.isNaN(t)) return null;
  const im = c.taxaTipo === 'aa' ? (1 + t) ** (1 / 12) - 1 : t;
  const ia = (1 + im) ** 12 - 1;
  const rows = [];
  let saldo = pv;
  let total = 0;
  if (c.sistema === 'sac') {
    const a = pv / n;
    for (let k = 1; k <= n; k++) {
      const j = saldo * im; const pmt = a + j; saldo -= a; total += pmt;
      rows.push({ n: k, pmt, j, a, saldo: Math.max(0, saldo) });
    }
  } else {
    const pmt = im === 0 ? pv / n : pv * im / (1 - (1 + im) ** -n);
    for (let k = 1; k <= n; k++) {
      const j = saldo * im; const a = pmt - j; saldo -= a; total += pmt;
      rows.push({ n: k, pmt, j, a, saldo: Math.max(0, saldo) });
    }
  }
  return { pv, ltv: Number(c.valor) ? pv / Number(c.valor) : 0, first: rows[0].pmt, last: rows[rows.length - 1].pmt, total, juros: total - pv, im, ia, rows };
}

// ---------------- Glossário ----------------
function glossario() {
  const q = normalize(ctx.ui.glossQuery);
  const list = GLOSSARY.filter((g) => !q || normalize(`${g.t} ${g.d} ${g.c}`).includes(q)).sort((a, b) => a.t.localeCompare(b.t, 'pt-BR'));
  return `
  <label class="field search-field"><span class="visually-hidden">Buscar no glossário</span>
    ${icon('search')}<input type="search" placeholder="Buscar termo (ex.: gravame, SFH, Renave)" value="${esc(ctx.ui.glossQuery)}" data-input="gloss-q" autocomplete="off">
  </label>
  <p class="visually-hidden" aria-live="polite">${list.length} termos.</p>
  <dl class="gloss">${list.map((g, i) => `
    <div class="gloss-item">
      <dt id="g-${i}">${esc(g.t)} <span class="tag">${esc(g.c)}</span></dt>
      <dd>${esc(g.d)} <button type="button" class="btn btn-sm btn-ghost" data-act="speak-text" data-text="${esc(`${g.t}. ${g.d}`)}" aria-describedby="g-${i}">${icon('speaker')} Ouvir</button></dd>
    </div>`).join('')}</dl>`;
}

// ---------------- Fontes ----------------
function fontes() {
  return SOURCES.map((g) => `
  <section class="card" aria-label="${esc(g.group)}">
    <h2>${esc(g.group)}</h2>
    <ul class="ref-list">${g.items.map((i) => `<li><a href="${esc(i.url)}" target="_blank" rel="noopener"><strong>${esc(i.name)}</strong><span class="visually-hidden"> (abre em nova aba)</span></a><span class="muted small"> — ${esc(i.note)}</span></li>`).join('')}</ul>
  </section>`).join('');
}
