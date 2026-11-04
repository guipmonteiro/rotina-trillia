// Estado do app, persistido no próprio aparelho (localStorage).
// Nada é enviado para servidores: ponto, localização e notas ficam só no telefone.

import { uid } from './util.js';

const KEY = 'rotina-trillia:v1';

export const DEFAULT_KEYWORDS = [
  'gravame', 'alienação fiduciária', 'registro de contratos', 'Renave', 'Renavam',
  'crédito imobiliário', 'financiamento imobiliário', 'financiamento de veículos',
  'SFH', 'SFI', 'poupança', 'Marco Legal das Garantias', 'registradora',
  'Detran', 'Senatran', 'Contran', 'CMN', 'home equity', 'securitização', 'CRI',
];

// Modalidades de trabalho. "counts" = conta para a cota presencial.
export const TONES = ['azul', 'violeta', 'ambar', 'verde', 'rosa', 'cinza'];
export function defaultModes() {
  return [
    { id: 'presencial', label: 'Presencial', short: 'P', desc: 'No escritório (validado pela localização)', tone: 'azul', counts: true, on: true, builtin: true },
    { id: 'remoto', label: 'Remoto', short: 'R', desc: 'Home office', tone: 'violeta', counts: false, on: true, builtin: true },
    { id: 'externo', label: 'Externo', short: 'E', desc: 'Cliente, evento ou visita', tone: 'ambar', counts: false, on: true, builtin: true },
  ];
}

export function defaults() {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    profile: { name: '', company: 'Trillia · B3', area: 'Infraestrutura para financiamentos' },
    offices: [],
    punches: [],
    days: {}, // { 'AAAA-MM-DD': { status: 'folga'|'feriado'|'ferias'|'atestado', note } }
    settings: {
      workMinutes: 480,
      lunchMinutes: 60,
      autoLunch: true, // desconta o almoço automaticamente nos dias trabalhados
      autoLunchAfter: 240, // a partir de quantos minutos de trabalho o almoço é descontado
      presencialGoal: 3, // legado (versão 1)
      presence: {
        type: 'pct_mes', // pct_mes | dias_semana | dias_mes
        pct: 60,
        daysWeek: 3,
        daysMonth: 12,
      },
      modes: defaultModes(),
      holidays: { nacionais: true, carnaval: true, sp: true, b3: false, extras: [] },
      workDays: [1, 2, 3, 4, 5],
      autoDetect: true,
      radiusDefault: 150,
      feedUrl: 'data/feed.json',
      reminders: {
        enabled: true,
        notify: true,
        tolerance: 10,
        items: [
          { id: 'entrada', label: 'Bater entrada', time: '09:00', on: true },
          { id: 'almoco', label: 'Intervalo de almoço', time: '12:30', on: false },
          { id: 'retorno', label: 'Voltar do intervalo', time: '13:30', on: false },
          { id: 'saida', label: 'Bater saída', time: '18:00', on: true },
        ],
        breaks: { on: false, every: 60 }, // pausas ativas / hidratação
      },
      keywords: [...DEFAULT_KEYWORDS],
    },
    a11y: {
      fontScale: 1,
      theme: 'auto', // auto | claro | escuro
      contrast: false,
      legible: false,
      spacing: false,
      reduceMotion: false,
      underline: true,
      bigTargets: false,
      simple: false,
      ttsRate: 1,
      ttsVoice: '',
      haptics: true,
      sound: true,
      vlibras: false,
    },
    tasks: [],
    notes: [],
    news: { read: {}, saved: {} },
    norms: { seen: {}, status: {}, notes: {}, lastVisit: null },
    reminderLog: {}, // { 'AAAA-MM-DD:entrada': true }
    onboarded: false,
  };
}

function merge(base, saved) {
  if (Array.isArray(base)) return Array.isArray(saved) ? saved : base;
  if (base && typeof base === 'object') {
    const out = { ...base };
    if (saved && typeof saved === 'object') {
      for (const k of Object.keys(saved)) {
        out[k] = k in base ? merge(base[k], saved[k]) : saved[k];
      }
    }
    return out;
  }
  return saved === undefined ? base : saved;
}

let state = migrate(load());
try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* */ }

function migrate(st) {
  // Garante as modalidades padrão e preserva personalizações
  const base = defaultModes();
  const have = new Map((st.settings.modes || []).map((m) => [m.id, m]));
  base.forEach((m) => { if (!have.has(m.id)) st.settings.modes.unshift(m); });
  st.settings.modes.forEach((m) => { if (m.id === 'presencial') { m.on = true; } });
  if (st.settings.presence && st.settings.presencialGoal !== 3 && !st.settings.presence._migrated) {
    st.settings.presence.daysWeek = st.settings.presencialGoal;
  }
  if (st.settings.presence) st.settings.presence._migrated = true;
  return st;
}
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    return merge(defaults(), JSON.parse(raw));
  } catch {
    return defaults();
  }
}

export function get() { return state; }

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Falha ao salvar', e);
  }
  listeners.forEach((fn) => fn(state));
}

export function update(fn) {
  fn(state);
  save();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function replaceAll(data) {
  state = migrate(merge(defaults(), data));
  save();
}

export function resetAll() {
  state = defaults();
  save();
}

export function exportJSON() {
  return JSON.stringify({ app: 'rotina-trillia', exportedAt: new Date().toISOString(), data: state }, null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  const data = parsed && parsed.data ? parsed.data : parsed;
  if (!data || typeof data !== 'object' || !('punches' in data)) {
    throw new Error('Arquivo não parece ser um backup deste app.');
  }
  replaceAll(data);
}

// ---------- Escritórios ----------
export function addOffice(o) {
  const office = {
    id: uid(),
    name: o.name?.trim() || 'Escritório',
    address: o.address?.trim() || '',
    lat: Number(o.lat),
    lng: Number(o.lng),
    radius: Number(o.radius) || state.settings.radiusDefault,
    createdAt: new Date().toISOString(),
  };
  update((s) => { s.offices.push(office); });
  return office;
}

export function editOffice(id, patch) {
  update((s) => {
    const o = s.offices.find((x) => x.id === id);
    if (o) Object.assign(o, patch);
  });
}

export function removeOffice(id) {
  update((s) => { s.offices = s.offices.filter((x) => x.id !== id); });
}

// ---------- Ponto ----------
export function addPunch(p) {
  const punch = { id: uid(), ts: new Date().toISOString(), ...p };
  update((s) => {
    s.punches.push(punch);
    s.punches.sort((a, b) => a.ts.localeCompare(b.ts));
  });
  return punch;
}

export function editPunch(id, patch) {
  update((s) => {
    const p = s.punches.find((x) => x.id === id);
    if (p) Object.assign(p, patch, { editedAt: new Date().toISOString() });
    s.punches.sort((a, b) => a.ts.localeCompare(b.ts));
  });
}

export function removePunch(id) {
  update((s) => { s.punches = s.punches.filter((x) => x.id !== id); });
}

// ---------- Tarefas e notas ----------
export function addTask(t) {
  const task = {
    id: uid(), title: t.title.trim(), notes: t.notes || '', due: t.due || '',
    priority: t.priority || 'normal', tag: t.tag || '', status: 'todo',
    createdAt: new Date().toISOString(),
  };
  update((s) => { s.tasks.unshift(task); });
  return task;
}

export function addNote(n) {
  const note = {
    id: uid(), title: n.title?.trim() || 'Sem título', body: n.body || '',
    pinned: false, updatedAt: new Date().toISOString(),
  };
  update((s) => { s.notes.unshift(note); });
  return note;
}
