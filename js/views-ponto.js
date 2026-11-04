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
  const h = now.getHours();
  const greet = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const name = s.profile.name ? `, ${esc(s.profile.name.split(' ')[0])}` : '';
  const week = P.weekSummary(now);
  const tasksToday = s.tasks.filter((t) => t.status !== 'done' && t.due && t.due <= key).slice(0, 4);
  const news = (ctx.feed?.news || []).slice(0, 3);
  const newNorms = countNewNorms();
  const nextAgenda = AGENDA.filter((a) => a.date >= key).sort((a, b) => a.date.localeCompare(b.date))[0];
  const pending = pendingReminder();
  const dayStatus = s.days[key]?.status;

  return `
  <header class="page-head">
    <p class="eyebrow">${esc(capitalize(dateLong(now)))}</p>
    <h1 tabindex="-1">${greet}${name}</h1>
  </header>

  ${!s.offices.length ? `
  <section class="card card-accent onboarding" aria-labelledby="ob-t">
    <h2 id="ob-t">${icon('building')} Cadastre seus escritórios</h2>
    <p>Para validar o presencial pela localização, informe onde ficam os escritórios. Você pode usar a localização atual quando estiver lá ou buscar pelo endereço.</p>
    <div class="row-btns">
      <button type="button" class="btn btn-primary" data-act="office-add-here">${icon('pin')} Usar minha localização</button>
      <button type="button" class="btn btn-ghost" data-act="office-add">${icon('search')} Buscar endereço</button>
    </div>
  </section>` : ''}

  ${ctx.banner ? `<div class="banner banner-${esc(ctx.banner.kind)}" role="status">
      ${icon(ctx.banner.kind === 'warn' ? 'alert' : 'pin')}
      <p>${esc(ctx.banner.text)}</p>
      ${ctx.banner.action ? `<button type="button" class="btn btn-sm btn-primary" data-act="${esc(ctx.banner.action.act)}" data-kind="${esc(ctx.banner.action.kind || '')}">${esc(ctx.banner.action.label)}</button>` : ''}
      <button type="button" class="icon-btn" data-act="banner-close" aria-label="Dispensar aviso">${icon('x')}</button>
    </div>` : ''}

  ${pending && !ctx.banner ? `<div class="banner banner-warn" role="status">${icon('bell')}<p><strong>Lembrete:</strong> ${esc(pending.label)} (${esc(pending.time)}). ${pending.kind === 'entrada' ? 'Você ainda não registrou a entrada hoje.' : ''}</p>
    <button type="button" class="btn btn-sm btn-primary" data-act="punch" data-kind="${esc(pending.kind)}">Registrar agora</button></div>` : ''}

  ${dayStatus ? `<div class="banner banner-info" role="status">${icon('calendar')}<p>Hoje está marcado como <strong>${esc(P.DAY_STATUS[dayStatus])}</strong>.</p><button type="button" class="btn btn-sm btn-ghost" data-act="day-open" data-day="${key}">Alterar</button></div>` : ''}

  ${punchCard(key, now)}

  <section class="card" aria-labelledby="loc-t">
    <div class="card-head">
      <h2 id="loc-t">${icon('pin')} Onde estou</h2>
      <button type="button" class="btn btn-sm btn-ghost" data-act="locate">${icon('refresh')} Verificar</button>
    </div>
    ${locationSummary()}
  </section>

  <section class="card" aria-labelledby="week-t">
    <div class="card-head">
      <h2 id="week-t">${icon('calendar')} Presença na semana</h2>
      <a class="link-sm" href="#ponto">Histórico</a>
    </div>
    <p class="big-stat"><strong>${week.presencial}</strong> de ${week.goal} dias presenciais <span class="muted">· ${fmtDuration(week.worked)} trabalhadas</span></p>
    <div class="meter" role="meter" aria-valuemin="0" aria-valuemax="${week.goal}" aria-valuenow="${Math.min(week.presencial, week.goal)}" aria-label="Meta de presença semanal: ${week.presencial} de ${week.goal} dias">
      <span style="width:${Math.min(100, (week.presencial / Math.max(1, week.goal)) * 100)}%"></span>
    </div>
    <ol class="week" aria-label="Dias da semana">
      ${week.days.map((d) => weekChip(d, key)).join('')}
    </ol>
    <p class="legend muted" aria-hidden="true"><span class="chip-mini m-presencial">P</span> presencial <span class="chip-mini m-remoto">R</span> remoto <span class="chip-mini m-externo">E</span> externo</p>
  </section>

  ${tasksToday.length ? `
  <section class="card" aria-labelledby="tk-t">
    <div class="card-head"><h2 id="tk-t">${icon('check')} Tarefas para hoje</h2><a class="link-sm" href="#trabalho-tarefas">Todas</a></div>
    <ul class="list-plain">${tasksToday.map((t) => `
      <li class="task-mini ${t.due < key ? 'late' : ''}">
        <label><input type="checkbox" data-change="task-toggle" data-id="${t.id}"> <span>${esc(t.title)}</span></label>
        ${t.due < key ? '<span class="tag tag-danger">Atrasada</span>' : ''}
      </li>`).join('')}</ul>
  </section>` : ''}

  <section class="card simple-hide" aria-labelledby="mk-t">
    <div class="card-head"><h2 id="mk-t">${icon('news')} Mercado</h2><a class="link-sm" href="#mercado-noticias">Ver tudo</a></div>
    ${newNorms ? `<a class="pill-link" href="#mercado-normas">${icon('scale')} <strong>${newNorms}</strong> ${newNorms === 1 ? 'norma nova' : 'normas novas'} para revisar</a>` : ''}
    ${nextAgenda ? `<p class="agenda-mini">${icon('calendar')} <span><strong>${esc(dateShort(parseDayKey(nextAgenda.date)))}</strong> · ${esc(nextAgenda.title)}</span></p>` : ''}
    ${news.length ? `<ul class="news-mini">${news.map((n) => `<li><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a><span class="muted"> · ${esc(n.source || '')} ${n.date ? '· ' + esc(relTime(n.date)) : ''}</span></li>`).join('')}</ul>` : `<p class="muted">${ctx.feedLoading ? 'Carregando notícias…' : 'Sem notícias carregadas.'}</p>`}
  </section>`;
}

function weekChip(d, todayKey) {
  const lbl = WEEKDAYS_SHORT[d.date.getDay()];
  const m = d.mode;
  const status = d.status ? P.DAY_STATUS[d.status] : '';
  const spoken = `${WEEKDAYS[d.date.getDay()]} ${d.date.getDate()}: ${m ? P.MODES[m].label : status || (d.key > todayKey ? 'futuro' : d.workDay ? 'sem registro' : 'não útil')}${d.worked ? ', ' + spokenDuration(d.worked) : ''}`;
  return `<li class="wchip ${m ? 'm-' + m : ''} ${d.key === todayKey ? 'today' : ''} ${!d.workDay && !m ? 'off' : ''}">
    <button type="button" data-act="day-open" data-day="${d.key}">
      <span class="wd" aria-hidden="true">${lbl}</span><span class="wl" aria-hidden="true">${m ? P.MODES[m].short : d.status ? '·' : '–'}</span><span class="visually-hidden">${esc(spoken)}</span>
    </button></li>`;
}

function punchCard(key, now) {
  const s = store.get();
  const list = P.punchesOf(key);
  const next = P.nextKinds(key);
  const worked = P.workedMinutes(key, now);
  const pct = Math.min(100, (worked / Math.max(1, s.settings.workMinutes)) * 100);
  const exit = P.expectedExit(key, now);
  const open = P.isOpen(key);
  const officeName = (id) => s.offices.find((o) => o.id === id)?.name;
  const status = !list.length ? 'Você ainda não registrou ponto hoje.'
    : P.onBreak(key) ? 'Em intervalo.'
      : open ? 'Expediente em andamento.' : 'Expediente encerrado.';
  return `
  <section class="card punch-card" aria-labelledby="pc-t">
    <h2 id="pc-t" class="visually-hidden">Registro de ponto</h2>
    <div class="clock" aria-hidden="true"><span data-tick="clock">${hhmm(now)}</span></div>
    <p class="punch-status">${esc(status)}</p>
    <div class="punch-btns">
      ${next.map((k, i) => `<button type="button" class="btn ${i === 0 ? 'btn-punch' : 'btn-ghost btn-lg'}" data-act="punch" data-kind="${k}">${icon(P.KINDS[k].icon)} ${esc(P.KINDS[k].verb)}</button>`).join('')}
    </div>
    <div class="worked">
      <div class="worked-row"><span>Trabalhado hoje</span><strong data-tick="worked">${fmtDuration(worked)}</strong></div>
      <div class="meter" role="meter" aria-label="Jornada do dia" aria-valuemin="0" aria-valuemax="${s.settings.workMinutes}" aria-valuenow="${Math.round(worked)}" aria-valuetext="${esc(spokenDuration(worked))} de ${esc(spokenDuration(s.settings.workMinutes))}">
        <span data-tick="worked-bar" style="width:${pct}%"></span>
      </div>
      ${exit ? `<p class="muted small">Previsão de saída: <strong data-tick="exit">${hhmm(exit)}</strong></p>` : ''}
    </div>
    ${list.length ? `
    <ol class="timeline" aria-label="Marcações de hoje">
      ${list.map((p) => `<li class="tl-item k-${p.kind}">
        <span class="tl-time">${hhmm(p.ts)}</span>
        <span class="tl-body"><strong>${esc(P.KINDS[p.kind]?.label)}</strong>
          <span class="tag m-${esc(p.mode)}">${esc(P.MODES[p.mode]?.label || '')}</span>
          ${p.officeId && officeName(p.officeId) ? `<span class="muted"> · ${esc(officeName(p.officeId))}</span>` : ''}
          ${p.noLocation ? '<span class="muted"> · sem localização</span>' : ''}
          ${p.outOfRadius && !p.noLocation ? '<span class="text-warn"> · fora do raio</span>' : ''}
          ${p.manual ? '<span class="muted"> · manual</span>' : ''}
          ${p.note ? `<span class="tl-note">${esc(p.note)}</span>` : ''}
        </span>
        <button type="button" class="icon-btn" data-act="punch-edit" data-id="${p.id}" aria-label="Editar marcação de ${esc(P.KINDS[p.kind]?.label)} às ${hhmm(p.ts)}">${icon('edit')}</button>
      </li>`).join('')}
    </ol>` : ''}
    <div class="row-btns center">
      <button type="button" class="btn btn-sm btn-ghost" data-act="punch-manual">${icon('plus')} Marcação manual</button>
      <button type="button" class="btn btn-sm btn-ghost" data-act="day-open" data-day="${key}">${icon('calendar')} Situação do dia</button>
    </div>
  </section>`;
}

function locationSummary() {
  const s = store.get();
  if (!geo.supported()) return '<p class="muted">Este navegador não oferece localização.</p>';
  if (ctx.locError) return `<p class="text-warn">${icon('alert')} ${esc(ctx.locError)}</p>`;
  const L = ctx.lastLoc;
  if (!L) return `<p class="muted">Localização ainda não verificada${s.settings.autoDetect ? ' (verificação automática ligada)' : ''}.</p>`;
  if (!s.offices.length) return `<p>Posição obtida (precisão ±${Math.round(L.acc)} m). Cadastre um escritório para comparar.</p>`;
  const n = L.ranked?.[0];
  if (!n) return '<p class="muted">Sem escritórios para comparar.</p>';
  return `
    <p class="loc-main ${n.inside ? 'inside' : 'outside'}">${icon(n.inside ? 'check' : 'home')}
      ${n.inside ? `Você está em <strong>${esc(n.office.name)}</strong>` : `Fora dos escritórios`}
    </p>
    <ul class="dist-list">${L.ranked.slice(0, 4).map((r) => `<li><span>${esc(r.office.name)}</span><span>${fmtDistance(r.dist)}${r.inside ? ' · dentro do raio' : ''}</span></li>`).join('')}</ul>
    <p class="muted small">Atualizado ${esc(relTime(L.at))} · precisão ±${Math.round(L.acc)} m</p>`;
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
  const done = {
    entrada: list.some((p) => p.kind === 'entrada'),
    almoco: list.some((p) => p.kind === 'pausa_inicio'),
    retorno: list.some((p) => p.kind === 'pausa_fim') || !list.some((p) => p.kind === 'pausa_inicio'),
    saida: list.some((p) => p.kind === 'saida') || !list.length,
  };
  const kindOf = { entrada: 'entrada', almoco: 'pausa_inicio', retorno: 'pausa_fim', saida: 'saida' };
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const due = r.items.filter((i) => i.on && nowMin >= timeToMin(i.time) + Number(r.tolerance || 0) && !done[i.id]);
  const it = due[due.length - 1];
  return it ? { ...it, kind: kindOf[it.id] } : null;
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
  let defaultMode = 'remoto';
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

  const modes = Object.entries(P.MODES).map(([v, m]) => ({ value: v, label: m.label }));
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
  toast(`${kindInfo.label} registrada às ${hhmm(punch.ts)} — ${P.MODES[mode].label}${oname ? ', ' + oname : ''}.`, { kind: 'ok' });
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
        <select name="mode" required>${Object.entries(P.MODES).map(([k, v]) => `<option value="${k}" ${k === mode ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>
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
      <p><strong>${fmtDuration(worked)}</strong> trabalhadas${P.dayMode(key) ? ` · ${P.MODES[P.dayMode(key)].label}` : ''}${P.expectedMinutes(d) ? ` · esperado ${fmtDuration(P.expectedMinutes(d))}` : ''}</p>
      ${list.length ? `<ol class="timeline compact">${list.map((p) => `<li class="tl-item k-${p.kind}"><span class="tl-time">${hhmm(p.ts)}</span><span class="tl-body">${esc(P.KINDS[p.kind].label)} <span class="tag m-${p.mode}">${esc(P.MODES[p.mode]?.label || '')}</span>${p.note ? `<span class="tl-note">${esc(p.note)}</span>` : ''}</span><button type="button" class="icon-btn" data-value="edit:${p.id}" aria-label="Editar ${esc(P.KINDS[p.kind].label)} às ${hhmm(p.ts)}">${icon('edit')}</button></li>`).join('')}</ol>` : '<p class="muted">Sem marcações neste dia.</p>'}
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
      <div><dt>Presencial</dt><dd>${ms.presencial} ${ms.presencial === 1 ? 'dia' : 'dias'}</dd></div>
      <div><dt>Remoto</dt><dd>${ms.remoto} ${ms.remoto === 1 ? 'dia' : 'dias'}</dd></div>
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
      const lbl = `${WEEKDAYS[d.date.getDay()]}, ${d.date.getDate()}: ${mode ? P.MODES[mode].label + ', ' + spokenDuration(d.worked) : d.status ? P.DAY_STATUS[d.status] : d.key > today ? 'sem registro (futuro)' : d.workDay ? 'sem registro' : 'dia não útil'}`;
      return `<td class="${mode ? 'm-' + mode : ''} ${d.key === today ? 'today' : ''} ${!d.workDay && !mode ? 'off' : ''} ${d.status ? 'st' : ''}">
        <button type="button" data-act="day-open" data-day="${d.key}">
          <span class="visually-hidden">${esc(lbl)}</span>
          <span class="cd" aria-hidden="true">${d.date.getDate()}</span>
          <span class="cm" aria-hidden="true">${mode ? P.MODES[mode].short : d.status ? '·' : ''}</span>
          <span class="ch" aria-hidden="true">${d.worked ? fmtDuration(d.worked).replace(' ', '') : ''}</span>
        </button></td>`;
    }).join('') + '</tr>';
  }
  return `<div class="cal-wrap"><table class="cal">
    <caption class="visually-hidden">Calendário de ${esc(monthLabel(m))}. Cada dia mostra a modalidade e as horas trabalhadas. Toque para detalhes.</caption>
    <thead><tr>${heads.map((h, i) => `<th scope="col"><abbr title="${full[i]}">${h}</abbr></th>`).join('')}</tr></thead>
    <tbody>${rows}</tbody></table></div>
    <p class="legend muted" aria-hidden="true"><span class="chip-mini m-presencial">P</span> presencial <span class="chip-mini m-remoto">R</span> remoto <span class="chip-mini m-externo">E</span> externo <span class="chip-mini">·</span> folga/feriado</p>`;
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
    lines.push(`${dateShort(d.date)} (${WEEKDAYS_SHORT[d.date.getDay()]}) ${d.status ? '[' + P.DAY_STATUS[d.status] + '] ' : ''}${list.map((p) => `${P.KINDS[p.kind].label.split(' ')[0]} ${hhmm(p.ts)}`).join(' · ')}${d.mode ? ` — ${P.MODES[d.mode].label}${of ? ' (' + of.name + ')' : ''}` : ''} — ${fmtDuration(d.worked)}`);
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
