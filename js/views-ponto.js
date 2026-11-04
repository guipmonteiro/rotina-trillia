// Telas "Hoje" e "Ponto": marcação com validação por localização, histórico e escritórios.

import * as store from './store.js';
import * as P from './ponto.js';
import * as geo from './geo.js';
import * as A from './a11y.js';
import { ctx } from './ctx.js';
import { icon, toast, openDialog, confirmDialog, busy, emptyState, segmented } from './ui.js';
import {
  esc, dayKey, parseDayKey, hhmm, dateLong, capitalize, fmtDuration, spokenDuration, fmtDistance,
  announce, relTime, monthLabel, addDays, WEEKDAYS, WEEKDAYS_SHORT, shareOrDownload, copyText, timeToMin, dateShort,
} from './util.js';
import { AGENDA, TOPICS } from './content.js';

// ======================================================================
// HOJE
// ======================================================================
export function renderHoje() {
  const s = store.get();
  const now = new Date();
  const key = dayKey(now);
  const tasksToday = s.tasks.filter((t) => t.status !== 'done' && t.due && t.due <= key).slice(0, 4);
  const news = (ctx.feed?.news || []).slice(0, 3);
  const newNorms = countNewNorms();
  const nextAgenda = AGENDA.filter((a) => a.date >= key).sort((a, b) => a.date.localeCompare(b.date))[0];
  const pending = pendingReminder();
  const dayStatus = s.days[key]?.status;
  const holiday = P.holidayName(key);
  const list = P.punchesOf(key);

  return `
  ${hero(key, now)}

  ${!s.onboarded ? `
  <section class="card card-accent welcome" aria-labelledby="wl-t">
    <h2 id="wl-t">${icon('sparkle')} Vamos deixar o app com a sua cara?</h2>
    <p>Em um minuto você define sua cota presencial, as modalidades que usa, a jornada e os lembretes.</p>
    <div class="row-btns">
      <button type="button" class="btn btn-primary" data-act="onboarding">Começar</button>
      <button type="button" class="btn btn-ghost" data-act="onboarding-skip">Agora não</button>
    </div>
  </section>` : ''}

  ${ctx.banner ? `<div class="banner banner-${esc(ctx.banner.kind)}" role="status">
      ${icon(ctx.banner.kind === 'warn' ? 'alert' : 'pin')}
      <p>${esc(ctx.banner.text)}</p>
      ${ctx.banner.action ? `<button type="button" class="btn btn-sm btn-primary" data-act="${esc(ctx.banner.action.act)}" data-kind="${esc(ctx.banner.action.kind || '')}">${esc(ctx.banner.action.label)}</button>` : ''}
      <button type="button" class="icon-btn" data-act="banner-close" aria-label="Dispensar aviso">${icon('x')}</button>
    </div>` : ''}

  ${pending && !ctx.banner ? `<div class="banner banner-warn" role="status">${icon('bell')}<p><strong>${esc(pending.label)}</strong> — era às ${esc(pending.time)}.${pending.kind === 'entrada' ? ' Você ainda não registrou a entrada hoje.' : ''}</p>
    <button type="button" class="btn btn-sm btn-primary" data-act="punch" data-kind="${esc(pending.kind)}">Registrar agora</button></div>` : ''}

  ${dayStatus || holiday ? `<div class="banner banner-info" role="status">${icon('calendar')}<p>Hoje é <strong>${esc(dayStatus ? P.DAY_STATUS[dayStatus] : holiday)}</strong> — não conta como dia útil.</p>${dayStatus ? `<button type="button" class="btn btn-sm btn-ghost" data-act="day-open" data-day="${key}">Alterar</button>` : ''}</div>` : ''}

  ${quotaCard(now)}

  ${list.length ? timelineCard(key, list) : ''}

  ${tasksToday.length ? `
  <section class="card" aria-labelledby="tk-t">
    <div class="card-head"><h2 id="tk-t">${icon('check')} Para hoje</h2><a class="link-sm" href="#trabalho-tarefas">Ver tarefas</a></div>
    <ul class="list-plain">${tasksToday.map((t) => `
      <li class="task-mini ${t.due < key ? 'late' : ''}">
        <label><input type="checkbox" data-change="task-toggle" data-id="${t.id}"> <span>${esc(t.title)}</span></label>
        ${t.due < key ? '<span class="tag tag-danger">Atrasada</span>' : ''}
      </li>`).join('')}</ul>
  </section>` : ''}

  <section class="card simple-hide" aria-labelledby="mk-t">
    <div class="card-head"><h2 id="mk-t">${icon('news')} Seu mercado hoje</h2><a class="link-sm" href="#mercado-noticias">Ver tudo</a></div>
    ${newNorms ? `<a class="pill-link" href="#mercado-normas">${icon('scale')} <span><strong>${newNorms}</strong> ${newNorms === 1 ? 'norma nova' : 'normas novas'} para você revisar</span></a>` : '<p class="muted small">Nenhuma norma nova desde a sua última visita.</p>'}
    ${nextAgenda ? `<p class="agenda-mini">${icon('calendar')} <span>Próximo marco: <strong>${esc(dateShort(parseDayKey(nextAgenda.date)))}</strong> · ${esc(nextAgenda.title)}</span></p>` : ''}
    ${news.length ? `<ul class="news-mini">${news.map((n) => `<li><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}<span class="visually-hidden"> (abre em nova aba)</span></a><span class="muted small"> · ${esc(n.source || '')}${n.date ? ' · ' + esc(relTime(n.date)) : ''}</span></li>`).join('')}</ul>` : `<p class="muted">${ctx.feedLoading ? 'Carregando notícias…' : 'Sem notícias carregadas.'}</p>`}
  </section>`;
}

/** Cartão principal: saudação, onde você está, relógio e botões de ponto */
function hero(key, now) {
  const s = store.get();
  const h = now.getHours();
  const greet = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const name = s.profile.name ? `, ${esc(s.profile.name.split(' ')[0])}` : '';
  const list = P.punchesOf(key);
  const next = P.nextKinds(key);
  const worked = P.workedMinutes(key, now);
  const pct = Math.min(100, (worked / Math.max(1, s.settings.workMinutes)) * 100);
  const exit = P.expectedExit(key, now);
  const open = P.isOpen(key);
  const first = list[0];
  const last = list[list.length - 1];
  let msg;
  if (!list.length) msg = P.isWorkDay(now) ? 'Você ainda não registrou o ponto hoje.' : 'Dia livre por aqui. Se for trabalhar, é só registrar.';
  else if (P.onBreak(key)) msg = `Em intervalo desde ${hhmm(last.ts)}. Bom descanso!`;
  else if (open) msg = `Trabalhando desde ${hhmm(first.ts)}${exit ? ` · saída prevista às ${hhmm(exit)}` : ''}.`;
  else msg = `Dia encerrado com ${fmtDuration(worked)} trabalhadas. Até amanhã!`;
  return `
  <section class="hero" aria-labelledby="hero-t">
    <div class="hero-top">
      <div>
        <p class="hero-date">${esc(capitalize(dateLong(now)))}</p>
        <h1 id="hero-t" tabindex="-1">${greet}${name}</h1>
      </div>
      <p class="hero-clock" aria-hidden="true" data-tick="clock">${hhmm(now)}</p>
    </div>
    ${locationPill()}
    <p class="hero-msg">${esc(msg)}</p>
    <div class="hero-btns">
      ${next.map((k, i) => `<button type="button" class="btn ${i === 0 ? 'btn-hero' : 'btn-hero-ghost'}" data-act="punch" data-kind="${k}">${icon(P.KINDS[k].icon)} ${esc(P.KINDS[k].verb)}</button>`).join('')}
    </div>
    ${list.length ? `
    <div class="hero-progress">
      <div class="worked-row"><span>Hoje</span><span><strong data-tick="worked">${fmtDuration(worked)}</strong> de ${fmtDuration(s.settings.workMinutes)}</span></div>
      ${s.settings.autoLunch && s.settings.lunchMinutes ? `<p class="hero-note" data-tick="lunch-note">${lunchNote(key, now)}</p>` : ''}
      <div class="meter meter-hero" role="meter" aria-label="Jornada do dia" aria-valuemin="0" aria-valuemax="${s.settings.workMinutes}" aria-valuenow="${Math.round(worked)}" aria-valuetext="${esc(spokenDuration(worked))} de ${esc(spokenDuration(s.settings.workMinutes))}">
        <span data-tick="worked-bar" style="width:${pct}%"></span>
      </div>
    </div>` : ''}
  </section>`;
}

export function lunchNote(key, now = new Date()) {
  const s = store.get().settings;
  const d = P.autoLunch(key, P.grossMinutes(key, now), now);
  if (d >= s.lunchMinutes) return `Almoço de ${fmtDuration(s.lunchMinutes)} já descontado automaticamente.`;
  if (d > 0) return `Descontando o almoço: ${fmtDuration(d)} de ${fmtDuration(s.lunchMinutes)}.`;
  return `${fmtDuration(s.lunchMinutes)} de almoço será descontada após ${fmtDuration(Number(s.autoLunchAfter ?? 240))} de trabalho.`;
}

function locationPill() {
  const s = store.get();
  if (!geo.supported()) return '';
  if (!s.offices.length) {
    return `<button type="button" class="loc-pill" data-act="office-add-here">${icon('pin')} <span>Cadastre seu escritório para validar o presencial</span></button>`;
  }
  if (ctx.locError) return `<button type="button" class="loc-pill warn" data-act="locate">${icon('alert')} <span>Localização indisponível · tocar para tentar</span></button>`;
  const n = ctx.lastLoc?.ranked?.[0];
  if (!n) return `<button type="button" class="loc-pill" data-act="locate">${icon('pin')} <span>Onde estou? Tocar para verificar</span></button>`;
  return `<button type="button" class="loc-pill ${n.inside ? 'in' : ''}" data-act="locate" aria-describedby="loc-when">
    ${icon(n.inside ? 'check' : 'home')} <span>${n.inside ? `Você está em <strong>${esc(n.office.name)}</strong>` : `Fora dos escritórios · ${esc(n.office.name)} a ${fmtDistance(n.dist)}`}</span>
  </button><span id="loc-when" class="visually-hidden">Verificado ${esc(relTime(ctx.lastLoc.at))}. Toque para verificar de novo.</span>`;
}

/** Anel da cota presencial */
export function quotaCard(now = new Date()) {
  const q = P.presence(now);
  const frac = q.target ? Math.min(1, q.done / q.target) : 1;
  const R = 44; const C = 2 * Math.PI * R;
  const msgs = {
    ok: `Meta cumprida! Você já tem ${q.done} ${q.done === 1 ? 'dia presencial' : 'dias presenciais'} neste ${q.period}.`,
    andamento: `Faltam <strong>${q.needed}</strong> ${q.needed === 1 ? 'dia presencial' : 'dias presenciais'} nos ${q.remaining} ${q.remaining === 1 ? 'dia útil' : 'dias úteis'} que restam.`,
    justo: `Atenção: os ${q.remaining} ${q.remaining === 1 ? 'dia útil restante precisa' : 'dias úteis restantes precisam'} ser presenciais.`,
    risco: `Não dá mais para bater a meta neste ${q.period}: faltam ${q.needed} e restam ${q.remaining} dias úteis.`,
  };
  const spoken = `Cota presencial: ${q.done} de ${q.target} dias${q.type === 'pct_mes' ? `, ${Math.round(q.pctNow)} por cento dos dias úteis` : ''}.`;
  const week = P.weekSummary(now);
  return `
  <section class="card quota quota-${q.state}" aria-labelledby="q-t">
    <div class="card-head">
      <h2 id="q-t">${icon('target')} Cota presencial ${q.period === 'mês' ? 'do mês' : 'da semana'}</h2>
      <a class="link-sm" href="#ajustes-presenca">Ajustar</a>
    </div>
    <div class="quota-body">
      <svg class="ring" viewBox="0 0 100 100" role="img" aria-label="${esc(spoken)}">
        <circle cx="50" cy="50" r="${R}" class="ring-bg"/>
        <circle cx="50" cy="50" r="${R}" class="ring-fg" stroke-dasharray="${(frac * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 50 50)"/>
        <text x="50" y="${q.type === 'pct_mes' ? 48 : 55}" class="ring-big">${q.type === 'pct_mes' ? `${Math.round(q.pctNow)}%` : `${q.done}/${q.target}`}</text>
        ${q.type === 'pct_mes' ? `<text x="50" y="66" class="ring-small">meta ${q.pctGoal}%</text>` : ''}
      </svg>
      <div class="quota-text">
        <p class="quota-msg">${msgs[q.state]}</p>
        <p class="muted small">${q.done} de ${q.target} ${q.target === 1 ? 'dia' : 'dias'} · meta de ${esc(q.label)}${q.type === 'pct_mes' ? ` (${q.workdays} dias úteis)` : ''}</p>
      </div>
    </div>
    <h3 class="week-title">Esta semana</h3>
    <ol class="week" aria-label="Dias desta semana">
      ${week.days.map((d) => weekChip(d, dayKey(now))).join('')}
    </ol>
    ${modeLegend()}
  </section>`;
}

export function modeLegend() {
  return `<p class="legend muted" aria-hidden="true">${P.activeModes().map((m) => `<span><span class="chip-mini tone-${esc(m.tone)}">${esc(m.short)}</span> ${esc(m.label.toLowerCase())}</span>`).join('')}<span><span class="chip-mini">·</span> folga/feriado</span></p>`;
}

function weekChip(d, todayKey) {
  const lbl = WEEKDAYS_SHORT[d.date.getDay()];
  const m = d.mode;
  const status = d.status ? P.DAY_STATUS[d.status] : d.holiday || '';
  const spoken = `${WEEKDAYS[d.date.getDay()]} ${d.date.getDate()}: ${m ? P.modeOf(m).label : status || (d.key > todayKey ? 'ainda não chegou' : d.workDay ? 'sem registro' : 'não útil')}${d.worked ? ', ' + spokenDuration(d.worked) : ''}`;
  return `<li class="wchip ${m ? P.modeClass(m) : ''} ${d.key === todayKey ? 'today' : ''} ${!d.workDay && !m ? 'off' : ''}">
    <button type="button" data-act="day-open" data-day="${d.key}">
      <span class="wd" aria-hidden="true">${lbl}</span><span class="wl" aria-hidden="true">${m ? esc(P.modeOf(m).short) : status ? '·' : d.date.getDate()}</span><span class="visually-hidden">${esc(spoken)}</span>
    </button></li>`;
}

function timelineCard(key, list) {
  return `
  <section class="card" aria-labelledby="tl-t">
    <div class="card-head"><h2 id="tl-t">${icon('clock')} Marcações de hoje</h2></div>
    ${timelineList(list)}
    <div class="row-btns">
      <button type="button" class="btn btn-sm btn-ghost" data-act="punch-manual">${icon('plus')} Esqueci de marcar</button>
      <button type="button" class="btn btn-sm btn-ghost" data-act="day-open" data-day="${key}">${icon('calendar')} Situação do dia</button>
    </div>
  </section>`;
}

function timelineList(list) {
  const s = store.get();
  const officeName = (id) => s.offices.find((o) => o.id === id)?.name;
  return `<ol class="timeline" aria-label="Marcações">
      ${list.map((p) => `<li class="tl-item k-${p.kind}">
        <span class="tl-dot ${P.modeClass(p.mode)}" aria-hidden="true">${icon(P.KINDS[p.kind]?.icon || 'clock')}</span>
        <span class="tl-time">${hhmm(p.ts)}</span>
        <span class="tl-body"><strong>${esc(P.KINDS[p.kind]?.label)}</strong>
          <span class="tag ${P.modeClass(p.mode)}">${esc(P.modeOf(p.mode).label)}</span>
          ${p.officeId && officeName(p.officeId) ? `<span class="muted"> · ${esc(officeName(p.officeId))}</span>` : ''}
          ${p.noLocation ? '<span class="muted"> · sem localização</span>' : ''}
          ${p.outOfRadius && !p.noLocation ? '<span class="text-warn"> · fora do raio</span>' : ''}
          ${p.manual ? '<span class="muted"> · manual</span>' : ''}
          ${p.note ? `<span class="tl-note">${esc(p.note)}</span>` : ''}
        </span>
        <button type="button" class="icon-btn" data-act="punch-edit" data-id="${p.id}" aria-label="Editar marcação de ${esc(P.KINDS[p.kind]?.label)} às ${hhmm(p.ts)}">${icon('edit')}</button>
      </li>`).join('')}
    </ol>`;
}

function punchCard(key, now) {
  // Versão compacta usada na aba Ponto
  const list = P.punchesOf(key);
  return `${hero(key, now).replace('id="hero-t" tabindex="-1"', 'id="hero-t"').replace(/<h1 /, '<h2 ').replace('</h1>', '</h2>')}
  ${list.length ? timelineCard(key, list) : `<div class="row-btns center"><button type="button" class="btn btn-sm btn-ghost" data-act="punch-manual">${icon('plus')} Esqueci de marcar</button></div>`}`;
}

export function countNewNorms() {
  const s = store.get();
  const list = ctx.feed?.normas || [];
  return list.filter((n) => !s.norms.seen[n.id] && !s.norms.status[n.id]).length;
}

export function pendingReminder(now = new Date()) {
  const s = store.get();
  const r = s.settings.reminders;
  if (!r.enabled || !P.isWorkDay(now)) return null;
  const key = dayKey(now);
  const list = P.punchesOf(key);
  const done = reminderDone(list, now);
  const kindOf = { entrada: 'entrada', almoco: 'pausa_inicio', retorno: 'pausa_fim', saida: 'saida' };
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const due = r.items.filter((i) => i.on && nowMin >= timeToMin(i.time) + Number(r.tolerance || 0) && !done[i.id] && startedBefore(list, i.time));
  const it = due[due.length - 1];
  return it ? { ...it, kind: kindOf[it.id] } : null;
}

/** Quais lembretes já não fazem sentido hoje */
export function reminderDone(list) {
  const key = list.length ? dayKey(new Date(list[0].ts)) : dayKey();
  return {
    entrada: list.some((p) => p.kind === 'entrada'),
    almoco: list.some((p) => p.kind === 'pausa_inicio') || !P.isOpen(key),
    retorno: list.some((p) => p.kind === 'pausa_fim') || !P.onBreak(key),
    saida: list.some((p) => p.kind === 'saida') || !list.length,
  };
}

/** Intervalo e saída só são cobrados se a entrada foi antes do horário do lembrete */
export function startedBefore(list, time) {
  const first = list.find((p) => p.kind === 'entrada');
  if (!first) return true;
  const d = new Date(first.ts);
  return d.getHours() * 60 + d.getMinutes() < timeToMin(time);
}

// ======================================================================
// MARCAÇÃO DE PONTO (fluxo com localização)
// ======================================================================
export async function punchFlow(kind) {
  const s = store.get();
  kind = kind || P.nextKinds()[0];
  const kindInfo = P.KINDS[kind];
  const done = busy('Obtendo sua localização…');
  let pos = null; let err = null;
  try { pos = await geo.getPosition({ maximumAge: 5000 }); } catch (e) { err = e; }
  done();
  const time = hhmm(new Date());

  let ranked = [];
  if (pos) {
    ranked = geo.rankOffices(pos);
    setLastLoc(pos, ranked);
  }
  const best = ranked[0];
  const inside = best && best.inside;

  let intro = '';
  const offMode = P.activeModes().find((m) => m.id !== 'presencial');
  let defaultMode = offMode ? offMode.id : 'presencial';
  if (err) {
    intro = `<p class="text-warn">${icon('alert')} ${esc(err.message)}</p><p>Você pode registrar sem localização; a marcação fica sinalizada.</p>`;
  } else if (!s.offices.length) {
    intro = `<p>Nenhum escritório cadastrado ainda. Posição obtida com precisão de ±${Math.round(pos.acc)} m.</p>
      <p><button type="button" class="btn btn-sm btn-ghost" data-value="cadastrar">${icon('building')} Cadastrar este local como escritório</button></p>`;
  } else if (inside) {
    defaultMode = 'presencial';
    intro = `<p class="loc-main inside">${icon('check')} Você está em <strong>${esc(best.office.name)}</strong> — a ${fmtDistance(best.dist)} (precisão ±${Math.round(pos.acc)} m).</p>`;
  } else {
    intro = `<p class="loc-main outside">${icon('home')} Fora dos escritórios. O mais próximo é <strong>${esc(best.office.name)}</strong>, a ${fmtDistance(best.dist)}.</p>
      ${pos.acc > 150 ? `<p class="muted small">A precisão do GPS está baixa (±${Math.round(pos.acc)} m). Se você está no escritório, tente "Tentar de novo".</p>` : ''}`;
  }

  const modes = P.activeModes().map((m) => ({ value: m.id, label: m.label }));
  const result = await openDialog({
    title: `${kindInfo.label} · ${time}`,
    body: `${intro}
      <form data-dialog-form class="form">
        <fieldset class="fieldset">
          <legend>Modalidade</legend>
          ${segmented('mode', modes, defaultMode, { label: 'Modalidade' })}
        </fieldset>
        ${s.offices.length > 1 || (s.offices.length && !inside) ? `
        <label class="field"><span>Escritório (para presencial)</span>
          <select name="officeId">${s.offices.map((o) => `<option value="${o.id}" ${best && best.office.id === o.id ? 'selected' : ''}>${esc(o.name)}${ranked.length ? ' · ' + fmtDistance(ranked.find((r) => r.office.id === o.id)?.dist) : ''}</option>`).join('')}</select>
        </label>` : s.offices.length ? `<input type="hidden" name="officeId" value="${s.offices[0].id}">` : ''}
        <label class="field"><span>Observação ${inside ? '(opcional)' : '(recomendada se for presencial fora do raio)'}</span>
          <input type="text" name="note" maxlength="200" autocomplete="off" placeholder="Ex.: reunião no cliente, GPS impreciso…">
        </label>
        <div class="dlg-actions">
          ${pos || err ? `<button type="button" class="btn btn-ghost" data-value="retry">${icon('refresh')} Tentar de novo</button>` : ''}
          <button type="submit" class="btn btn-primary btn-lg" autofocus>${icon('check')} Confirmar ${esc(kindInfo.label.toLowerCase())}</button>
        </div>
      </form>`,
  });
  if (result === 'retry') return punchFlow(kind);
  if (result === 'cadastrar') { await officeDialog(null, pos); return punchFlow(kind); }
  if (!result || typeof result !== 'object') { announce('Marcação cancelada.'); return null; }

  const mode = result.mode || defaultMode;
  const officeId = mode === 'presencial' ? (result.officeId || best?.office.id || null) : null;
  const officeRank = ranked.find((r) => r.office.id === officeId);
  const punch = store.addPunch({
    kind, mode, officeId,
    lat: pos ? +pos.lat.toFixed(5) : null,
    lng: pos ? +pos.lng.toFixed(5) : null,
    acc: pos ? Math.round(pos.acc) : null,
    dist: officeRank ? Math.round(officeRank.dist) : best ? Math.round(best.dist) : null,
    inside: officeRank ? officeRank.inside : false,
    noLocation: !pos,
    outOfRadius: mode === 'presencial' && (!officeRank || !officeRank.inside),
    note: (result.note || '').trim(),
  });
  const oname = store.get().offices.find((o) => o.id === officeId)?.name;
  A.beep('ok');
  A.haptic([30, 40, 30]);
  ctx.banner = null;
  toast(`Pronto! ${kindInfo.label} registrada às ${hhmm(punch.ts)} — ${P.modeOf(mode).label}${oname ? ', ' + oname : ''}.`, { kind: 'ok' });
  updateBadge();
  ctx.render();
  return punch;
}

export function setLastLoc(pos, ranked) {
  ctx.lastLoc = { ...pos, at: new Date().toISOString(), ranked: ranked || geo.rankOffices(pos) };
  ctx.locError = '';
}

export async function locateNow({ silent = false } = {}) {
  const done = silent ? () => {} : busy('Verificando localização…');
  try {
    const pos = await geo.getPosition({ maximumAge: silent ? 60000 : 0 });
    setLastLoc(pos);
    if (!silent) {
      const n = ctx.lastLoc.ranked[0];
      announce(n ? (n.inside ? `Você está em ${n.office.name}.` : `Fora dos escritórios. Mais próximo: ${n.office.name}, a ${fmtDistance(n.dist)}.`) : 'Posição obtida.');
    }
  } catch (e) {
    if (!silent) ctx.locError = e.message;
  } finally {
    done();
  }
  return ctx.lastLoc;
}

/** Detecção automática ao abrir o app: sugere entrada/saída conforme a posição */
export async function autoDetect() {
  const s = store.get();
  if (!s.settings.autoDetect || !s.offices.length || !geo.supported()) return;
  const perm = await geo.permissionState();
  if (perm !== 'granted') return; // não abre pedido de permissão sem o usuário tocar em algo
  const L = await locateNow({ silent: true });
  if (!L) return;
  const key = dayKey();
  const list = P.punchesOf(key);
  const n = L.ranked[0];
  if (!n) return;
  if (n.inside && !list.length && P.isWorkDay(new Date())) {
    ctx.banner = { kind: 'ok', text: `Você chegou em ${n.office.name}. Registrar entrada presencial?`, action: { act: 'punch', kind: 'entrada', label: 'Registrar entrada' } };
    notify('Você chegou ao escritório', `Toque para registrar a entrada em ${n.office.name}.`, 'chegada');
  } else if (!n.inside && P.isOpen(key) && !P.onBreak(key)) {
    const last = list[list.length - 1];
    const lastOffice = last?.officeId && s.offices.find((o) => o.id === last.officeId);
    if (last && last.mode === 'presencial' && lastOffice) {
      const d = L.ranked.find((r) => r.office.id === lastOffice.id)?.dist || 0;
      if (d > lastOffice.radius + 250) {
        ctx.banner = { kind: 'warn', text: `Parece que você saiu de ${lastOffice.name} (${fmtDistance(d)}). Registrar saída ou intervalo?`, action: { act: 'punch', kind: P.nextKinds()[0], label: P.KINDS[P.nextKinds()[0]].verb } };
      }
    }
  }
  ctx.render();
}

export async function notify(title, body, tag) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!store.get().settings.reminders.notify) return;
    const reg = await navigator.serviceWorker?.getRegistration();
    const opts = { body, tag, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', data: { url: './#bater' }, renotify: true };
    if (reg) reg.showNotification(title, opts); else new Notification(title, opts);
  } catch { /* */ }
}

export function updateBadge() {
  try {
    const n = pendingReminder() ? 1 : 0;
    if ('setAppBadge' in navigator) n ? navigator.setAppBadge(n) : navigator.clearAppBadge();
  } catch { /* */ }
}

// ---------- Edição / marcação manual ----------
export async function punchEditDialog(id) {
  const s = store.get();
  const p = s.punches.find((x) => x.id === id);
  if (!p) return;
  const d = new Date(p.ts);
  const r = await openDialog({
    title: 'Editar marcação',
    body: `
      <form data-dialog-form class="form">
        ${punchFields({ kind: p.kind, date: dayKey(d), time: hhmm(d), mode: p.mode, officeId: p.officeId, note: p.note })}
        ${p.lat != null ? `<p class="muted small">Registrada com localização (${p.lat}, ${p.lng}), precisão ±${p.acc} m${p.dist != null ? `, a ${fmtDistance(p.dist)} do escritório` : ''}.</p>` : '<p class="muted small">Registrada sem localização.</p>'}
        <div class="dlg-actions">
          <button type="submit" class="btn btn-danger-ghost" data-value="delete" formnovalidate>${icon('trash')} Excluir</button>
          <button type="submit" class="btn btn-primary" data-value="save">${icon('check')} Salvar</button>
        </div>
      </form>`,
  });
  if (!r) return;
  if (r._action === 'delete') {
    if (await confirmDialog('Excluir marcação?', `${P.KINDS[p.kind].label} de ${dateShort(d)} às ${hhmm(d)} será removida.`, { ok: 'Excluir', danger: true })) {
      store.removePunch(id);
      toast('Marcação excluída.');
    }
  } else {
    const ts = new Date(`${r.date}T${r.time}:00`);
    store.editPunch(id, { kind: r.kind, ts: ts.toISOString(), mode: r.mode, officeId: r.mode === 'presencial' ? r.officeId || null : null, note: r.note });
    toast('Marcação atualizada.', { kind: 'ok' });
  }
  ctx.render();
}

function punchFields({ kind, date, time, mode, officeId, note }) {
  const s = store.get();
  return `
    <div class="grid-2">
      <label class="field"><span>Tipo</span>
        <select name="kind" required>${Object.entries(P.KINDS).map(([k, v]) => `<option value="${k}" ${k === kind ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>
      </label>
      <label class="field"><span>Modalidade</span>
        <select name="mode" required>${P.allModes().filter((m) => m.on || m.id === mode).map((m) => `<option value="${esc(m.id)}" ${m.id === mode ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select>
      </label>
      <label class="field"><span>Data</span><input type="date" name="date" value="${esc(date)}" required></label>
      <label class="field"><span>Hora</span><input type="time" name="time" value="${esc(time)}" required></label>
    </div>
    ${s.offices.length ? `<label class="field"><span>Escritório (presencial)</span>
      <select name="officeId"><option value="">—</option>${s.offices.map((o) => `<option value="${o.id}" ${o.id === officeId ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select></label>` : ''}
    <label class="field"><span>Observação</span><input type="text" name="note" value="${esc(note || '')}" maxlength="200"></label>`;
}

export async function punchManualDialog(date) {
  const s = store.get();
  const key = date || dayKey();
  const next = P.nextKinds(key)[0];
  const r = await openDialog({
    title: 'Marcação manual',
    body: `<p class="muted">Use para registrar um ponto esquecido. Ela fica identificada como manual.</p>
      <form data-dialog-form class="form">
        ${punchFields({ kind: next, date: key, time: hhmm(new Date()), mode: s.offices.length ? 'presencial' : 'remoto', officeId: s.offices[0]?.id, note: '' })}
        <div class="dlg-actions"><button type="submit" class="btn btn-primary">${icon('check')} Registrar</button></div>
      </form>`,
  });
  if (!r) return;
  const ts = new Date(`${r.date}T${r.time}:00`);
  store.addPunch({ kind: r.kind, ts: ts.toISOString(), mode: r.mode, officeId: r.mode === 'presencial' ? r.officeId || null : null, note: r.note, manual: true, noLocation: true });
  toast(`${P.KINDS[r.kind].label} manual registrada (${dateShort(ts)} ${hhmm(ts)}).`, { kind: 'ok' });
  ctx.render();
}

export async function dayDialog(key) {
  const s = store.get();
  const d = parseDayKey(key);
  const list = P.punchesOf(key);
  const cur = s.days[key] || {};
  const worked = P.workedMinutes(key);
  const r = await openDialog({
    title: capitalize(dateLong(d)),
    body: `
      <p><strong>${fmtDuration(worked)}</strong> trabalhadas${P.autoLunch(key) ? ` (já sem ${fmtDuration(P.autoLunch(key))} de almoço)` : ''}${P.dayMode(key) ? ` · ${P.modeOf(P.dayMode(key)).label}` : ''}${P.holidayName(key) ? ` · feriado: ${esc(P.holidayName(key))}` : ''}${P.expectedMinutes(d) ? ` · esperado ${fmtDuration(P.expectedMinutes(d))}` : ''}</p>
      ${list.length ? `<ol class="timeline compact">${list.map((p) => `<li class="tl-item k-${p.kind}"><span class="tl-time">${hhmm(p.ts)}</span><span class="tl-body">${esc(P.KINDS[p.kind].label)} <span class="tag ${P.modeClass(p.mode)}">${esc(P.modeOf(p.mode).label)}</span>${p.note ? `<span class="tl-note">${esc(p.note)}</span>` : ''}</span><button type="button" class="icon-btn" data-value="edit:${p.id}" aria-label="Editar ${esc(P.KINDS[p.kind].label)} às ${hhmm(p.ts)}">${icon('edit')}</button></li>`).join('')}</ol>` : '<p class="muted">Sem marcações neste dia.</p>'}
      <form data-dialog-form class="form">
        <label class="field"><span>Situação do dia</span>
          <select name="status"><option value="">Dia normal</option>${Object.entries(P.DAY_STATUS).map(([k, v]) => `<option value="${k}" ${cur.status === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
        </label>
        <p class="hint">Folga, feriado, férias e abono não contam como dia útil no banco de horas.</p>
        <label class="field"><span>Anotação</span><input type="text" name="note" value="${esc(cur.note || '')}" maxlength="200"></label>
        <div class="dlg-actions">
          <button type="button" class="btn btn-ghost" data-value="manual">${icon('plus')} Marcação manual</button>
          <button type="submit" class="btn btn-primary">${icon('check')} Salvar</button>
        </div>
      </form>`,
  });
  if (!r) return;
  if (typeof r === 'string' && r.startsWith('edit:')) return punchEditDialog(r.slice(5));
  if (r === 'manual') return punchManualDialog(key);
  store.update((st) => {
    if (r.status || r.note) st.days[key] = { status: r.status || null, note: r.note || '' };
    else delete st.days[key];
  });
  toast('Dia atualizado.', { kind: 'ok' });
  ctx.render();
}

// ======================================================================
// PONTO (histórico)
// ======================================================================
export function renderPonto() {
  const s = store.get();
  const now = new Date();
  const m = ctx.ui.month || new Date(now.getFullYear(), now.getMonth(), 1);
  ctx.ui.month = m;
  const ms = P.monthSummary(m.getFullYear(), m.getMonth());
  const total = P.totalBalance();
  const isCurrent = m.getFullYear() === now.getFullYear() && m.getMonth() === now.getMonth();
  const workdays = ms.days.filter((d) => d.workDay).length;
  const pctMonth = workdays ? Math.round((ms.presencial / workdays) * 100) : 0;
  const cfg = s.settings.presence;
  const usedModes = P.allModes().filter((md) => md.on || ms.byMode[md.id]);

  return `
  <header class="page-head">
    <p class="eyebrow">Controle de jornada</p>
    <h1 tabindex="-1">Ponto e presença</h1>
  </header>

  ${punchCard(dayKey(now), now)}

  <section class="card" aria-labelledby="hist-t">
    <div class="card-head">
      <h2 id="hist-t">${icon('calendar')} ${esc(capitalize(monthLabel(m)))}</h2>
      <div class="row-btns tight">
        <button type="button" class="icon-btn" data-act="month-prev" aria-label="Mês anterior">${icon('chev-left')}</button>
        ${!isCurrent ? `<button type="button" class="btn btn-sm btn-ghost" data-act="month-today">Atual</button>` : ''}
        <button type="button" class="icon-btn" data-act="month-next" aria-label="Próximo mês">${icon('chev-right')}</button>
      </div>
    </div>
    <dl class="stats">
      <div><dt>Trabalhado</dt><dd>${fmtDuration(ms.worked)}</dd></div>
      <div><dt>Esperado</dt><dd>${fmtDuration(ms.expected)}</dd></div>
      <div><dt>Saldo do mês</dt><dd class="${ms.balance < 0 ? 'neg' : 'pos'}">${fmtDuration(ms.balance, { sign: true })}</dd></div>
      <div class="stat-wide"><dt>Cota presencial</dt><dd>${pctMonth}% <small class="muted">· ${ms.presencial} de ${workdays} dias úteis${cfg.type === 'pct_mes' ? ` · meta ${cfg.pct}%` : ''}</small></dd></div>
      ${usedModes.map((md) => `<div><dt>${esc(md.label)}</dt><dd>${ms.byMode[md.id] || 0} ${(ms.byMode[md.id] || 0) === 1 ? 'dia' : 'dias'}</dd></div>`).join('')}
      <div><dt>Banco total</dt><dd class="${total < 0 ? 'neg' : 'pos'}">${fmtDuration(total, { sign: true })}</dd></div>
    </dl>
    ${calendarTable(m, ms)}
    <div class="row-btns">
      <button type="button" class="btn btn-ghost" data-act="export-csv">${icon('download')} Exportar planilha (CSV)</button>
      <button type="button" class="btn btn-ghost" data-act="copy-summary">${icon('copy')} Copiar resumo</button>
    </div>
  </section>

  <section class="card" aria-labelledby="of-t">
    <div class="card-head"><h2 id="of-t">${icon('building')} Escritórios</h2><a class="link-sm" href="#ajustes-escritorios">Gerenciar</a></div>
    ${s.offices.length ? `<ul class="office-list">${s.offices.map((o) => `<li><strong>${esc(o.name)}</strong><span class="muted">${esc(o.address || `${o.lat.toFixed(5)}, ${o.lng.toFixed(5)}`)} · raio ${o.radius} m</span></li>`).join('')}</ul>`
      : emptyState('building', 'Nenhum escritório', 'Cadastre os locais de trabalho para validar o presencial.', `<button type="button" class="btn btn-primary" data-act="office-add-here">${icon('pin')} Usar minha localização</button>`)}
  </section>`;
}

function calendarTable(m, ms) {
  const today = dayKey();
  const first = new Date(m.getFullYear(), m.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7; // semana começa na segunda
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  ms.days.forEach((d) => cells.push(d));
  while (cells.length % 7) cells.push(null);
  const heads = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const full = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  let rows = '';
  for (let i = 0; i < cells.length; i += 7) {
    rows += '<tr>' + cells.slice(i, i + 7).map((d) => {
      if (!d) return '<td class="empty-cell"></td>';
      const mode = d.mode;
      const lbl = `${WEEKDAYS[d.date.getDay()]}, ${d.date.getDate()}: ${mode ? P.modeOf(mode).label + ', ' + spokenDuration(d.worked) : d.status ? P.DAY_STATUS[d.status] : d.holiday ? 'feriado, ' + d.holiday : d.key > today ? 'sem registro (futuro)' : d.workDay ? 'sem registro' : 'dia não útil'}`;
      return `<td class="${mode ? P.modeClass(mode) : ''} ${d.key === today ? 'today' : ''} ${!d.workDay && !mode ? 'off' : ''} ${d.status || d.holiday ? 'st' : ''}" ${d.holiday ? `title="${esc(d.holiday)}"` : ''}>
        <button type="button" data-act="day-open" data-day="${d.key}">
          <span class="visually-hidden">${esc(lbl)}</span>
          <span class="cd" aria-hidden="true">${d.date.getDate()}</span>
          <span class="cm" aria-hidden="true">${mode ? esc(P.modeOf(mode).short) : d.status || d.holiday ? '·' : ''}</span>
          <span class="ch" aria-hidden="true">${d.worked ? fmtDuration(d.worked).replace(' ', '') : ''}</span>
        </button></td>`;
    }).join('') + '</tr>';
  }
  return `<div class="cal-wrap"><table class="cal">
    <caption class="visually-hidden">Calendário de ${esc(monthLabel(m))}. Cada dia mostra a modalidade e as horas trabalhadas. Toque para detalhes.</caption>
    <thead><tr>${heads.map((h, i) => `<th scope="col"><abbr title="${full[i]}">${h}</abbr></th>`).join('')}</tr></thead>
    <tbody>${rows}</tbody></table></div>
    ${modeLegend()}`;
}

export async function exportCSV() {
  const m = ctx.ui.month || new Date();
  const csv = P.toCSV(m.getFullYear(), m.getMonth());
  const name = `ponto-${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}.csv`;
  const r = await shareOrDownload(name, csv, 'text/csv');
  if (r !== 'aborted') toast('Planilha gerada.', { kind: 'ok' });
}

export async function copySummary() {
  const m = ctx.ui.month || new Date();
  const ms = P.monthSummary(m.getFullYear(), m.getMonth());
  const s = store.get();
  const lines = [`Resumo de ponto — ${monthLabel(m)}`, `Trabalhado: ${fmtDuration(ms.worked)} | Esperado: ${fmtDuration(ms.expected)} | Saldo: ${fmtDuration(ms.balance, { sign: true })}`, `Presencial: ${ms.presencial} dias | Remoto: ${ms.remoto} | Externo: ${ms.externo}`, ''];
  for (const d of ms.days) {
    const list = P.punchesOf(d.key);
    if (!list.length && !d.status) continue;
    const of = P.dayOffice(d.key);
    lines.push(`${dateShort(d.date)} (${WEEKDAYS_SHORT[d.date.getDay()]}) ${d.status ? '[' + P.DAY_STATUS[d.status] + '] ' : ''}${list.map((p) => `${P.KINDS[p.kind].label.split(' ')[0]} ${hhmm(p.ts)}`).join(' · ')}${d.mode ? ` — ${P.modeOf(d.mode).label}${of ? ' (' + of.name + ')' : ''}` : ''} — ${fmtDuration(d.worked)}`);
  }
  const ok = await copyText(lines.join('\n'));
  toast(ok ? 'Resumo copiado.' : 'Não foi possível copiar.', { kind: ok ? 'ok' : 'error' });
  void s;
}

// ======================================================================
// ESCRITÓRIOS
// ======================================================================
export async function officeDialog(id, presetPos) {
  const s = store.get();
  const o = id ? s.offices.find((x) => x.id === id) : null;
  let lat = o?.lat ?? presetPos?.lat ?? '';
  let lng = o?.lng ?? presetPos?.lng ?? '';
  let address = o?.address || '';
  if (!o && presetPos) address = await geo.reverse(presetPos.lat, presetPos.lng);
  const r = await openDialog({
    title: o ? 'Editar escritório' : 'Novo escritório',
    wide: true,
    body: `
      <form data-dialog-form class="form" id="office-form">
        <label class="field"><span>Nome</span><input type="text" name="name" required maxlength="60" value="${esc(o?.name || '')}" placeholder="Ex.: Sede B3 – Centro" autofocus></label>
        <div class="field">
          <label for="addr-q">Endereço</label>
          <div class="input-row">
            <input type="search" id="addr-q" name="address" value="${esc(address)}" placeholder="Rua, número, cidade" autocomplete="street-address">
            <button type="button" class="btn btn-ghost" id="addr-go">${icon('search')}<span class="visually-hidden">Buscar endereço</span></button>
          </div>
          <ul class="addr-results" id="addr-results" aria-live="polite"></ul>
        </div>
        <div class="row-btns"><button type="button" class="btn btn-ghost" id="use-here">${icon('pin')} Usar minha localização atual</button></div>
        <div class="grid-2">
          <label class="field"><span>Latitude</span><input type="number" step="any" name="lat" id="of-lat" required value="${esc(lat)}" inputmode="decimal"></label>
          <label class="field"><span>Longitude</span><input type="number" step="any" name="lng" id="of-lng" required value="${esc(lng)}" inputmode="decimal"></label>
        </div>
        <label class="field"><span>Raio de presença: <output id="rad-out">${o?.radius || s.settings.radiusDefault}</output> m</span>
          <input type="range" name="radius" id="of-rad" min="50" max="1000" step="25" value="${o?.radius || s.settings.radiusDefault}" aria-describedby="rad-hint">
        </label>
        <p class="hint" id="rad-hint">Prédios grandes ou GPS impreciso pedem raio maior (150–300 m funciona bem na maioria dos casos).</p>
        <div id="of-map" class="map" role="img" aria-label="Mapa do escritório com o raio de presença"></div>
        <p class="muted small" id="of-map-note">Dica: cole coordenadas do Google Maps (toque e segure no local → copie os números).</p>
        <div class="dlg-actions">
          ${o ? `<button type="submit" class="btn btn-danger-ghost" data-value="delete" formnovalidate>${icon('trash')} Excluir</button>` : ''}
          <button type="submit" class="btn btn-primary" data-value="save">${icon('check')} Salvar</button>
        </div>
      </form>`,
    onOpen: (dlg) => wireOfficeForm(dlg),
  });
  if (!r) return null;
  if (r._action === 'delete') {
    if (await confirmDialog('Excluir escritório?', `"${o.name}" será removido. As marcações antigas continuam no histórico.`, { ok: 'Excluir', danger: true })) {
      store.removeOffice(o.id);
      toast('Escritório excluído.');
      ctx.render();
    }
    return null;
  }
  const data = { name: r.name, address: r.address, lat: Number(r.lat), lng: Number(r.lng), radius: Number(r.radius) };
  if (o) store.editOffice(o.id, data); else store.addOffice(data);
  toast(o ? 'Escritório atualizado.' : `Escritório "${data.name}" cadastrado.`, { kind: 'ok' });
  if (ctx.lastLoc) setLastLoc(ctx.lastLoc);
  ctx.render();
  return true;
}

function wireOfficeForm(dlg) {
  const q = dlg.querySelector('#addr-q');
  const res = dlg.querySelector('#addr-results');
  const lat = dlg.querySelector('#of-lat');
  const lng = dlg.querySelector('#of-lng');
  const rad = dlg.querySelector('#of-rad');
  const out = dlg.querySelector('#rad-out');
  let map = null; let marker = null; let circle = null;

  const drawMap = async () => {
    const la = Number(lat.value); const ln = Number(lng.value);
    if (!la || !ln) return;
    try {
      await loadLeaflet();
      const L = window.L;
      if (!map) {
        map = L.map(dlg.querySelector('#of-map'), { zoomControl: true, attributionControl: true, keyboard: true }).setView([la, ln], 17);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
        marker = L.marker([la, ln], { draggable: true, keyboard: true, title: 'Posição do escritório (arraste para ajustar)' }).addTo(map);
        circle = L.circle([la, ln], { radius: Number(rad.value), color: '#00A0DF', fillOpacity: 0.15 }).addTo(map);
        marker.on('dragend', () => { const p = marker.getLatLng(); lat.value = p.lat.toFixed(6); lng.value = p.lng.toFixed(6); circle.setLatLng(p); });
        map.on('click', (e) => { lat.value = e.latlng.lat.toFixed(6); lng.value = e.latlng.lng.toFixed(6); marker.setLatLng(e.latlng); circle.setLatLng(e.latlng); });
        setTimeout(() => map.invalidateSize(), 200);
      } else {
        marker.setLatLng([la, ln]); circle.setLatLng([la, ln]); circle.setRadius(Number(rad.value)); map.setView([la, ln]);
      }
      dlg.querySelector('#of-map')?.classList.add('on');
    } catch {
      const note = dlg.querySelector('#of-map-note');
      if (note) note.textContent = 'Mapa indisponível agora — as coordenadas continuam válidas.';
    }
  };

  rad.addEventListener('input', () => { out.textContent = rad.value; if (circle) circle.setRadius(Number(rad.value)); });
  [lat, lng].forEach((el) => el.addEventListener('change', drawMap));
  lat.addEventListener('paste', (e) => {
    const t = (e.clipboardData || window.clipboardData).getData('text');
    const m = t.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
    if (m) { e.preventDefault(); lat.value = m[1]; lng.value = m[2]; drawMap(); }
  });

  const search = async () => {
    const v = q.value.trim();
    if (v.length < 4) { res.innerHTML = '<li class="muted">Digite um endereço mais completo.</li>'; return; }
    res.innerHTML = '<li class="muted">Buscando…</li>';
    try {
      const items = await geo.searchAddress(v);
      if (!items.length) { res.innerHTML = '<li class="muted">Nenhum resultado. Tente incluir a cidade.</li>'; return; }
      res.innerHTML = items.map((it, i) => `<li><button type="button" class="addr-pick" data-i="${i}">${esc(it.label)}</button></li>`).join('');
      res.querySelectorAll('.addr-pick').forEach((b) => b.addEventListener('click', () => {
        const it = items[Number(b.dataset.i)];
        lat.value = it.lat.toFixed(6); lng.value = it.lng.toFixed(6);
        q.value = it.label.split(',').slice(0, 4).join(',');
        res.innerHTML = `<li class="ok-text">${icon('check')} Endereço selecionado.</li>`;
        drawMap();
        lat.focus();
      }));
    } catch (e) {
      res.innerHTML = `<li class="text-warn">${esc(e.message)}</li>`;
    }
  };
  dlg.querySelector('#addr-go').addEventListener('click', search);
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } });

  dlg.querySelector('#use-here').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.lastChild.textContent = ' Obtendo…';
    try {
      const pos = await geo.getPosition({ maximumAge: 0 });
      lat.value = pos.lat.toFixed(6); lng.value = pos.lng.toFixed(6);
      if (!q.value) q.value = await geo.reverse(pos.lat, pos.lng);
      announce(`Localização obtida com precisão de ${Math.round(pos.acc)} metros.`);
      drawMap();
    } catch (err) {
      res.innerHTML = `<li class="text-warn">${esc(err.message)}</li>`;
    } finally {
      btn.disabled = false;
      btn.lastChild.textContent = ' Usar minha localização atual';
    }
  });
  drawMap();
}

let leafletP = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (leafletP) return leafletP;
  leafletP = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.onload = () => resolve();
    s.onerror = () => { leafletP = null; reject(new Error('leaflet')); };
    document.head.appendChild(s);
    setTimeout(() => { if (!window.L) { leafletP = null; reject(new Error('timeout')); } }, 8000);
  });
  return leafletP;
}

export function topicsLabel(t) { return TOPICS[t] || t; }
