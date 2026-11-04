// Feriados calculados automaticamente (nacionais, São Paulo e dias sem pregão na B3).
// Usados para descontar dias não úteis da cota presencial e do banco de horas.

import * as store from './store.js';
import { dayKey } from './util.js';

function easter(y) {
  // Algoritmo de Meeus/Jones/Butcher
  const a = y % 19; const b = Math.floor(y / 100); const c = y % 100;
  const d = Math.floor(b / 4); const e = b % 4; const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3); const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}

const add = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const cache = new Map();

export function holidaysOf(year) {
  const h = store.get().settings.holidays || {};
  const sig = `${year}:${JSON.stringify(h)}`;
  if (cache.has(sig)) return cache.get(sig);
  const out = {};
  const put = (d, name) => { out[dayKey(d)] = name; };
  const fixed = (m, d, name) => put(new Date(year, m - 1, d), name);
  const e = easter(year);
  if (h.nacionais !== false) {
    fixed(1, 1, 'Confraternização Universal');
    put(add(e, -2), 'Sexta-feira Santa');
    fixed(4, 21, 'Tiradentes');
    fixed(5, 1, 'Dia do Trabalho');
    fixed(9, 7, 'Independência');
    fixed(10, 12, 'Nossa Senhora Aparecida');
    fixed(11, 2, 'Finados');
    fixed(11, 15, 'Proclamação da República');
    fixed(11, 20, 'Dia da Consciência Negra');
    fixed(12, 25, 'Natal');
  }
  if (h.carnaval !== false) {
    put(add(e, -48), 'Carnaval (segunda)');
    put(add(e, -47), 'Carnaval (terça)');
  }
  if (h.sp !== false) {
    fixed(1, 25, 'Aniversário de São Paulo');
    fixed(7, 9, 'Revolução Constitucionalista (SP)');
    put(add(e, 60), 'Corpus Christi');
  }
  if (h.b3) {
    fixed(12, 24, 'Véspera de Natal (sem pregão B3)');
    fixed(12, 31, 'Último dia do ano (sem pregão B3)');
  }
  (h.extras || []).forEach((x) => { if (x.date && x.date.startsWith(String(year))) out[x.date] = x.name || 'Feriado'; });
  cache.set(sig, out);
  return out;
}

export function holidayName(key) {
  return holidaysOf(Number(key.slice(0, 4)))[key] || null;
}
