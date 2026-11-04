// Regras de ponto: sequência de marcações, horas trabalhadas, presença e banco de horas.

import * as store from './store.js';
import { dayKey, parseDayKey, addDays, startOfWeek, hhmm, dateShort, fmtDuration, WEEKDAYS } from './util.js';

export const KINDS = {
  entrada: { label: 'Entrada', verb: 'Registrar entrada', icon: 'in' },
  pausa_inicio: { label: 'Início do intervalo', verb: 'Iniciar intervalo', icon: 'pause' },
  pausa_fim: { label: 'Fim do intervalo', verb: 'Voltar do intervalo', icon: 'play' },
  saida: { label: 'Saída', verb: 'Registrar saída', icon: 'out' },
};

export const MODES = {
  presencial: { label: 'Presencial', short: 'P', desc: 'No escritório' },
  remoto: { label: 'Remoto', short: 'R', desc: 'Home office' },
  externo: { label: 'Externo', short: 'E', desc: 'Cliente, evento ou viagem' },
};

export const DAY_STATUS = {
  folga: 'Folga',
  feriado: 'Feriado',
  ferias: 'Férias',
  atestado: 'Atestado / abono',
  compensacao: 'Compensação de horas',
};

export function punchesOf(key) {
  return store.get().punches.filter((p) => dayKey(new Date(p.ts)) === key);
}

/** Próximas marcações possíveis, em ordem de preferência */
export function nextKinds(key = dayKey()) {
  const list = punchesOf(key);
  const last = list[list.length - 1];
  if (!last || last.kind === 'saida') return ['entrada'];
  if (last.kind === 'pausa_inicio') return ['pausa_fim'];
  const hadPause = list.some((p) => p.kind === 'pausa_inicio');
  const lunch = store.get().settings.lunchMinutes > 0;
  if (!hadPause && lunch) return ['pausa_inicio', 'saida'];
  return ['saida', 'pausa_inicio'];
}

/** Minutos trabalhados no dia (conta até agora se o período estiver aberto e for hoje) */
export function workedMinutes(key = dayKey(), now = new Date()) {
  const list = punchesOf(key);
  let total = 0;
  let open = null;
  for (const p of list) {
    const t = new Date(p.ts).getTime();
    if (p.kind === 'entrada' || p.kind === 'pausa_fim') {
      if (open == null) open = t;
    } else if (p.kind === 'pausa_inicio' || p.kind === 'saida') {
      if (open != null) { total += t - open; open = null; }
    }
  }
  if (open != null && key === dayKey(now)) total += now.getTime() - open;
  return Math.max(0, total / 60000);
}

export function breakMinutes(key = dayKey(), now = new Date()) {
  const list = punchesOf(key);
  let total = 0;
  let open = null;
  for (const p of list) {
    const t = new Date(p.ts).getTime();
    if (p.kind === 'pausa_inicio') open = t;
    if (p.kind === 'pausa_fim' && open != null) { total += t - open; open = null; }
  }
  if (open != null && key === dayKey(now)) total += now.getTime() - open;
  return total / 60000;
}

export function isOpen(key = dayKey()) {
  const list = punchesOf(key);
  const last = list[list.length - 1];
  return !!last && last.kind !== 'saida';
}

export function onBreak(key = dayKey()) {
  const list = punchesOf(key);
  const last = list[list.length - 1];
  return !!last && last.kind === 'pausa_inicio';
}

/** Modo do dia: presencial se houve qualquer marcação presencial */
export function dayMode(key) {
  const list = punchesOf(key);
  if (!list.length) return null;
  if (list.some((p) => p.mode === 'presencial')) return 'presencial';
  if (list.some((p) => p.mode === 'externo')) return 'externo';
  return 'remoto';
}

export function dayOffice(key) {
  const p = punchesOf(key).find((x) => x.mode === 'presencial' && x.officeId);
  if (!p) return null;
  return store.get().offices.find((o) => o.id === p.officeId) || null;
}

export function isWorkDay(date) {
  const s = store.get();
  const k = dayKey(date);
  if (s.days[k]?.status) return false;
  return s.settings.workDays.includes(date.getDay());
}

export function expectedMinutes(date) {
  return isWorkDay(date) ? store.get().settings.workMinutes : 0;
}

/** Previsão de saída com base na jornada */
export function expectedExit(key = dayKey(), now = new Date()) {
  const s = store.get().settings;
  const list = punchesOf(key);
  if (!list.length || !isOpen(key)) return null;
  const worked = workedMinutes(key, now);
  const remaining = s.workMinutes - worked;
  const hadPause = list.some((p) => p.kind === 'pausa_inicio');
  let extra = 0;
  if (!hadPause && s.lunchMinutes > 0) extra = s.lunchMinutes;
  if (onBreak(key)) {
    const b = breakMinutes(key, now);
    extra = Math.max(0, s.lunchMinutes - b);
  }
  return new Date(now.getTime() + (remaining + extra) * 60000);
}

export function weekSummary(ref = new Date()) {
  const start = startOfWeek(ref);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const k = dayKey(d);
    days.push({
      date: d, key: k, mode: dayMode(k), worked: workedMinutes(k),
      status: store.get().days[k]?.status || null, workDay: isWorkDay(d),
    });
  }
  const presencial = days.filter((d) => d.mode === 'presencial').length;
  const worked = days.reduce((a, d) => a + d.worked, 0);
  return { start, days, presencial, worked, goal: store.get().settings.presencialGoal };
}

export function monthSummary(year, month) {
  const today = dayKey();
  const all = store.get().punches;
  const startKey = all.length ? dayKey(new Date(all[0].ts)) : today;
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days = [];
  let worked = 0; let expected = 0; let presencial = 0; let remoto = 0; let externo = 0;
  for (let d = new Date(first); d <= last; d = addDays(d, 1)) {
    const k = dayKey(d);
    const w = workedMinutes(k);
    const m = dayMode(k);
    const past = k >= startKey && (k < today || (k === today && !isOpen(k) && punchesOf(k).length));
    const exp = past ? expectedMinutes(d) : 0;
    worked += w;
    expected += exp;
    if (m === 'presencial') presencial++;
    if (m === 'remoto') remoto++;
    if (m === 'externo') externo++;
    days.push({ date: new Date(d), key: k, worked: w, expected: exp, mode: m, status: store.get().days[k]?.status || null, workDay: isWorkDay(d) });
  }
  return { days, worked, expected, balance: worked - expected, presencial, remoto, externo };
}

/** Banco de horas acumulado desde o primeiro registro até ontem (ou hoje, se encerrado) */
export function totalBalance() {
  const s = store.get();
  if (!s.punches.length) return 0;
  const first = parseDayKey(dayKey(new Date(s.punches[0].ts)));
  const today = dayKey();
  let bal = 0;
  for (let d = new Date(first); dayKey(d) <= today; d = addDays(d, 1)) {
    const k = dayKey(d);
    if (k === today && isOpen(k)) break;
    if (k === today && !punchesOf(k).length) break;
    bal += workedMinutes(k) - expectedMinutes(d);
  }
  return bal;
}

export function toCSV(year, month) {
  const s = store.get();
  const officeName = (id) => s.offices.find((o) => o.id === id)?.name || '';
  const rows = [['Data', 'Dia da semana', 'Hora', 'Marcação', 'Modalidade', 'Escritório', 'Distância (m)', 'Precisão GPS (m)', 'Manual', 'Observação']];
  const sum = [['Data', 'Modalidade do dia', 'Trabalhado', 'Esperado', 'Saldo', 'Situação']];
  const ms = monthSummary(year, month);
  for (const p of s.punches) {
    const d = new Date(p.ts);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    rows.push([
      dateShort(d), WEEKDAYS[d.getDay()], hhmm(d), KINDS[p.kind]?.label || p.kind,
      MODES[p.mode]?.label || '', officeName(p.officeId),
      p.dist != null ? Math.round(p.dist) : '', p.acc != null ? Math.round(p.acc) : '',
      p.manual ? 'sim' : '', p.note || '',
    ]);
  }
  for (const d of ms.days) {
    if (!d.worked && !d.status && !d.expected) continue;
    sum.push([
      dateShort(d.date), d.mode ? MODES[d.mode].label : '', fmtDuration(d.worked),
      fmtDuration(d.expected), fmtDuration(d.worked - d.expected, { sign: true }),
      d.status ? DAY_STATUS[d.status] : '',
    ]);
  }
  const csv = (r) => r.map((c) => {
    const v = String(c ?? '');
    return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(';');
  return '﻿' + [...rows.map(csv), '', 'RESUMO DIÁRIO', ...sum.map(csv)].join('\r\n');
}
