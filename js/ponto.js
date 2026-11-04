// Regras de ponto: sequência de marcações, horas trabalhadas, presença e banco de horas.

import * as store from './store.js';
import { dayKey, parseDayKey, addDays, startOfWeek, hhmm, dateShort, fmtDuration, WEEKDAYS } from './util.js';
import { holidayName } from './holidays.js';

export const KINDS = {
  entrada: { label: 'Entrada', verb: 'Registrar entrada', icon: 'in' },
  pausa_inicio: { label: 'Início do intervalo', verb: 'Iniciar intervalo', icon: 'pause' },
  pausa_fim: { label: 'Fim do intervalo', verb: 'Voltar do intervalo', icon: 'play' },
  saida: { label: 'Saída', verb: 'Registrar saída', icon: 'out' },
};

// ---------- Modalidades (configuráveis em Ajustes → Presença) ----------
export function allModes() { return store.get().settings.modes; }
export function activeModes() { return allModes().filter((m) => m.on); }
export function modeOf(id) {
  return allModes().find((m) => m.id === id) || { id, label: id || '—', short: '?', tone: 'cinza', counts: false, on: false };
}
export const modeClass = (id) => `tone-${modeOf(id).tone || 'cinza'}`;
// Compatibilidade: P.MODES[id] continua funcionando
export const MODES = new Proxy({}, { get: (_, id) => (typeof id === 'string' ? modeOf(id) : undefined) });

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
/**
 * Horas líquidas do dia. Com o desconto automático ligado, o intervalo (1h por padrão)
 * é descontado mesmo sem marcação: as primeiras horas contam inteiras e, passado o
 * limite configurado (4h por padrão), o tempo seguinte vira almoço até completar o intervalo.
 * Intervalos marcados manualmente abatem do desconto automático.
 */
export function workedMinutes(key = dayKey(), now = new Date()) {
  const gross = grossMinutes(key, now);
  return Math.max(0, gross - autoLunch(key, gross, now));
}

/** Minutos de almoço descontados automaticamente no dia */
export function autoLunch(key = dayKey(), gross = grossMinutes(key), now = new Date()) {
  const s = store.get().settings;
  if (!s.autoLunch || !s.lunchMinutes) return 0;
  const rest = Math.max(0, s.lunchMinutes - breakMinutes(key, now));
  const after = Number(s.autoLunchAfter ?? 240);
  return Math.min(rest, Math.max(0, gross - after));
}

/** Tempo bruto entre entradas e saídas (sem os intervalos marcados) */
export function grossMinutes(key = dayKey(), now = new Date()) {
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

/** Modalidade do dia: a que conta para a cota tem prioridade; senão, a da primeira marcação */
export function dayMode(key) {
  const list = punchesOf(key);
  if (!list.length) return null;
  const c = list.find((p) => modeOf(p.mode).counts);
  return (c || list[0]).mode;
}

export const dayCounts = (key) => { const m = dayMode(key); return !!m && modeOf(m).counts; };

export function dayOffice(key) {
  const p = punchesOf(key).find((x) => x.mode === 'presencial' && x.officeId);
  if (!p) return null;
  return store.get().offices.find((o) => o.id === p.officeId) || null;
}

export function isWorkDay(date) {
  const s = store.get();
  const k = dayKey(date);
  if (s.days[k]?.status) return false;
  if (holidayName(k)) return false;
  return s.settings.workDays.includes(date.getDay());
}

export { holidayName };

/**
 * Cota presencial no período (mês ou semana, conforme o tipo de meta).
 * Base: dias úteis (dias de trabalho menos feriados, férias, folgas e abonos).
 */
export function presence(ref = new Date()) {
  const cfg = store.get().settings.presence;
  const today = dayKey(ref);
  let start; let end;
  if (cfg.type === 'dias_semana') { start = startOfWeek(ref); end = addDays(start, 6); }
  else { start = new Date(ref.getFullYear(), ref.getMonth(), 1); end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0); }
  const days = [];
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    const k = dayKey(d);
    days.push({ date: new Date(d), key: k, work: isWorkDay(d), counts: dayCounts(k), mode: dayMode(k), holiday: holidayName(k), status: store.get().days[k]?.status || null });
  }
  const workdays = days.filter((d) => d.work).length;
  const done = days.filter((d) => d.counts).length;
  const todayDone = days.find((d) => d.key === today)?.counts;
  const remaining = days.filter((d) => d.work && (d.key > today || (d.key === today && !todayDone))).length;
  let target;
  if (cfg.type === 'pct_mes') target = Math.ceil((Number(cfg.pct) / 100) * workdays - 1e-9);
  else if (cfg.type === 'dias_semana') target = Number(cfg.daysWeek);
  else target = Number(cfg.daysMonth);
  target = Math.min(target, workdays);
  const needed = Math.max(0, target - done);
  const pctNow = workdays ? (done / workdays) * 100 : 0;
  const state = needed === 0 ? 'ok' : needed > remaining ? 'risco' : needed === remaining ? 'justo' : 'andamento';
  const label = cfg.type === 'pct_mes' ? `${cfg.pct}% dos dias úteis do mês` : cfg.type === 'dias_semana' ? `${cfg.daysWeek} dias por semana` : `${cfg.daysMonth} dias no mês`;
  return { type: cfg.type, pctGoal: Number(cfg.pct), days, workdays, done, target, needed, remaining, pctNow, state, label, period: cfg.type === 'dias_semana' ? 'semana' : 'mês' };
}

export function expectedMinutes(date) {
  return isWorkDay(date) ? store.get().settings.workMinutes : 0;
}

/** Previsão de saída com base na jornada */
export function expectedExit(key = dayKey(), now = new Date()) {
  const s = store.get().settings;
  const list = punchesOf(key);
  if (!list.length || !isOpen(key)) return null;
  if (s.autoLunch) {
    // Simula o restante do dia minuto a minuto (até 16h) considerando o desconto automático
    const breakLeft = onBreak(key) ? Math.max(0, s.lunchMinutes - breakMinutes(key, now)) : 0;
    const gross = grossMinutes(key, now);
    const pb = breakMinutes(key, now) + breakLeft;
    const rest = Math.max(0, s.lunchMinutes - pb);
    const after = Number(s.autoLunchAfter ?? 240);
    for (let t = 0; t <= 960; t++) {
      const g = gross + t;
      const net = g - Math.min(rest, Math.max(0, g - after));
      if (net >= s.workMinutes) return new Date(now.getTime() + (breakLeft + t) * 60000);
    }
    return null;
  }
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
      status: store.get().days[k]?.status || null, workDay: isWorkDay(d), holiday: holidayName(k),
    });
  }
  const presencial = days.filter((d) => d.mode && modeOf(d.mode).counts).length;
  const worked = days.reduce((a, d) => a + d.worked, 0);
  return { start, days, presencial, worked, goal: store.get().settings.presence.daysWeek };
}

export function monthSummary(year, month) {
  const today = dayKey();
  const all = store.get().punches;
  const startKey = all.length ? dayKey(new Date(all[0].ts)) : today;
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days = [];
  let worked = 0; let expected = 0; let presencial = 0; let remoto = 0; let externo = 0;
  const byMode = {};
  for (let d = new Date(first); d <= last; d = addDays(d, 1)) {
    const k = dayKey(d);
    const w = workedMinutes(k);
    const m = dayMode(k);
    const past = k >= startKey && (k < today || (k === today && !isOpen(k) && punchesOf(k).length));
    const exp = past ? expectedMinutes(d) : 0;
    worked += w;
    expected += exp;
    if (m) byMode[m] = (byMode[m] || 0) + 1;
    if (m && modeOf(m).counts) presencial++;
    if (m === 'remoto') remoto++;
    if (m === 'externo') externo++;
    days.push({ date: new Date(d), key: k, worked: w, expected: exp, mode: m, status: store.get().days[k]?.status || null, workDay: isWorkDay(d), holiday: holidayName(k) });
  }
  return { days, worked, expected, balance: worked - expected, presencial, remoto, externo, byMode };
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
  const sum = [['Data', 'Modalidade do dia', 'Trabalhado (líquido)', 'Almoço descontado', 'Esperado', 'Saldo', 'Situação']];
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
      dateShort(d.date), d.mode ? MODES[d.mode].label : '', fmtDuration(d.worked), fmtDuration(autoLunch(d.key)),
      fmtDuration(d.expected), fmtDuration(d.worked - d.expected, { sign: true }),
      d.status ? DAY_STATUS[d.status] : d.holiday || '',
    ]);
  }
  const csv = (r) => r.map((c) => {
    const v = String(c ?? '');
    return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(';');
  return '﻿' + [...rows.map(csv), '', 'RESUMO DIÁRIO', ...sum.map(csv)].join('\r\n');
}
