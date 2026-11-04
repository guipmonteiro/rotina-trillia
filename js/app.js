// Ponto de entrada: rotas, eventos, lembretes, feed e service worker.

import * as store from './store.js';
import * as P from './ponto.js';
import * as A from './a11y.js';
import * as VP from './views-ponto.js';
import * as VM from './views-mercado.js';
import * as VT from './views-trabalho.js';
import * as VA from './views-ajustes.js';
import { ctx } from './ctx.js';
import { toast, confirmDialog, openDialog, icon } from './ui.js';
import { esc, dayKey, hhmm, fmtDuration, announce, copyText, debounce, timeToMin, uid } from './util.js';

const main = document.getElementById('main');
const FEED_CACHE = 'rotina-trillia:feed';

// ======================================================================
// Rotas
// ======================================================================
function parseHash() {
  const h = (location.hash || '#hoje').slice(1);
  const [route, ...rest] = h.split('-');
  return { route: route || 'hoje', sub: rest.join('-') };
}

function render({ focus = false } = {}) {
  const { route, sub } = parseHash();
  const routeChanged = route !== ctx.route || sub !== ctx.sub;
  ctx.route = route; ctx.sub = sub;
  const activeId = document.activeElement?.id;
  const activeAct = document.activeElement?.closest?.('[data-act]')?.dataset;
  const scroll = window.scrollY;

  let html;
  switch (route) {
    case 'ponto': html = VP.renderPonto(); break;
    case 'mercado': html = VM.renderMercado(sub || 'noticias'); break;
    case 'trabalho': html = VT.renderTrabalho(sub || 'tarefas'); break;
    case 'ajustes': html = VA.renderAjustes(sub || 'acessibilidade'); break;
    default: html = VP.renderHoje();
  }
  main.innerHTML = html;

  document.querySelectorAll('.tabbar a').forEach((a) => {
    const r = a.getAttribute('href').slice(1);
    if (r === route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const badge = document.getElementById('tab-badge-mercado');
  const n = VP.countNewNorms();
  if (badge) { badge.textContent = n ? String(n) : ''; badge.hidden = !n; badge.setAttribute('aria-label', `${n} normas novas`); }

  const h1 = main.querySelector('h1');
  document.title = `${h1 ? h1.textContent.trim() + ' · ' : ''}Rotina Trillia`;
  if (focus || routeChanged) {
    window.scrollTo(0, 0);
    if (focus && h1) h1.focus({ preventScroll: true });
  } else {
    window.scrollTo(0, scroll);
    // restaura o foco no mesmo controle após re-renderizar
    let el = activeId && document.getElementById(activeId);
    if (!el && activeAct?.act) {
      const sel = `[data-act="${activeAct.act}"]${activeAct.id ? `[data-id="${CSS.escape(activeAct.id)}"]` : ''}${activeAct.kind ? `[data-kind="${activeAct.kind}"]` : ''}${activeAct.st ? `[data-st="${activeAct.st}"]` : ''}`;
      el = main.querySelector(sel);
    }
    if (el && el !== document.body) el.focus({ preventScroll: true });
  }
}
ctx.render = () => render();

window.addEventListener('hashchange', () => {
  if (location.hash === '#bater') { handleBater(); return; }
  A.stopSpeaking();
  render({ focus: true });
});

async function handleBater() {
  history.replaceState(null, '', '#hoje');
  render({ focus: true });
  await VP.punchFlow();
}

// ======================================================================
// Ações (delegação de eventos)
// ======================================================================
const actions = {
  punch: (el) => VP.punchFlow(el.dataset.kind),
  'punch-edit': (el) => VP.punchEditDialog(el.dataset.id),
  'punch-manual': () => VP.punchManualDialog(),
  'day-open': (el) => VP.dayDialog(el.dataset.day),
  locate: async () => { await VP.locateNow(); render(); },
  'banner-close': () => { ctx.banner = null; render(); },
  'month-prev': () => { const m = ctx.ui.month; ctx.ui.month = new Date(m.getFullYear(), m.getMonth() - 1, 1); render(); announce(main.querySelector('#hist-t')?.textContent || ''); },
  'month-next': () => { const m = ctx.ui.month; ctx.ui.month = new Date(m.getFullYear(), m.getMonth() + 1, 1); render(); announce(main.querySelector('#hist-t')?.textContent || ''); },
  'month-today': () => { ctx.ui.month = null; render(); },
  'export-csv': () => VP.exportCSV(),
  'copy-summary': () => VP.copySummary(),
  'office-add': () => VP.officeDialog(null),
  'office-add-here': async () => {
    const pos = await VP.locateNow();
    if (!pos) { toast(ctx.locError || 'Não foi possível obter a localização.', { kind: 'error' }); render(); return; }
    VP.officeDialog(null, pos);
  },
  'office-edit': (el) => VP.officeDialog(el.dataset.id),

  // Mercado
  'feed-refresh': () => loadFeed({ force: true }),
  'news-open': (el) => { store.update((s) => { s.news.read[el.dataset.id] = true; }); setTimeout(render, 300); return 'default'; },
  'news-read': (el) => { store.update((s) => { if (s.news.read[el.dataset.id]) delete s.news.read[el.dataset.id]; else s.news.read[el.dataset.id] = true; }); render(); },
  'news-save': (el) => { store.update((s) => { if (s.news.saved[el.dataset.id]) delete s.news.saved[el.dataset.id]; else s.news.saved[el.dataset.id] = true; }); render(); announce(store.get().news.saved[el.dataset.id] ? 'Notícia salva.' : 'Notícia removida das salvas.'); },
  'news-task': (el) => { const n = VM.findNews(el.dataset.id); if (n) VT.taskDialog(null, { title: `Ler: ${n.title}`.slice(0, 140), notes: n.source || '', tag: topicTag(n.topic), link: n.url }); },
  'speak-news': (el) => VM.speakItem(VM.findNews(el.dataset.id)),
  'speak-norm': (el) => VM.speakItem(VM.findNorm(el.dataset.id)),
  'speak-text': (el) => { if (A.speaking()) A.stopSpeaking(); else A.speak(el.dataset.text); },
  share: (el) => VM.share(el.dataset.url, el.dataset.title),
  'norm-open': (el) => { store.update((s) => { s.norms.seen[el.dataset.id] = true; }); setTimeout(render, 300); return 'default'; },
  'norm-seen': (el) => { store.update((s) => { s.norms.seen[el.dataset.id] = true; }); render(); announce('Marcada como vista.'); },
  'norm-status': (el) => {
    const { id, st } = el.dataset;
    store.update((s) => { if (s.norms.status[id] === st) delete s.norms.status[id]; else s.norms.status[id] = st; s.norms.seen[id] = true; });
    render();
    announce(store.get().norms.status[id] === st ? (st === 'relevante' ? 'Marcada como relevante.' : 'Arquivada.') : 'Desmarcada.');
  },
  'norm-note': (el) => VM.normNoteDialog(el.dataset.id),
  'norm-task': (el) => { const n = VM.findNorm(el.dataset.id); if (n) VT.taskDialog(null, { title: `Avaliar impacto: ${n.kind} ${n.number || ''} ${n.title}`.slice(0, 140), notes: n.ementa || '', tag: 'Regulatório', priority: 'alta', link: n.url }); },
  'norms-seen-all': () => { store.update((s) => { (ctx.feed?.normas || []).forEach((n) => { s.norms.seen[n.id] = true; }); }); render(); announce('Todas as normas marcadas como vistas.'); },
  'kw-del': (el) => { store.update((s) => { s.settings.keywords.splice(Number(el.dataset.i), 1); }); render(); },
  'kw-reset': () => { store.update((s) => { s.settings.keywords = [...store.DEFAULT_KEYWORDS]; }); toast('Palavras-chave restauradas.'); },
  'agenda-ics': (el) => VM.agendaICS(Number(el.dataset.i)),

  // Trabalho
  'task-edit': (el) => VT.taskDialog(el.dataset.id),
  'tasks-clear-done': async () => { if (await confirmDialog('Limpar concluídas?', 'As tarefas concluídas serão apagadas.', { ok: 'Limpar', danger: true })) { store.update((s) => { s.tasks = s.tasks.filter((t) => t.status !== 'done'); }); render(); } },
  'note-new': () => VT.noteDialog(null),
  'note-open': (el) => VT.noteDialog(el.dataset.id),
  'dictate-into': (el) => {
    const input = document.getElementById(el.dataset.target);
    const r = A.dictate((t) => { input.value = (input.value ? input.value + ' ' : '') + t; }, () => el.setAttribute('aria-pressed', 'false'));
    if (r) { el.setAttribute('aria-pressed', 'true'); announce('Fale agora.'); setTimeout(() => r.stop(), 8000); }
  },
  'focus-toggle': () => {
    const f = ctx.ui.focus;
    if (f.running) { f.remaining = Math.max(0, Math.round((f.endsAt - Date.now()) / 1000)); f.running = false; announce('Pausado.'); }
    else { f.endsAt = Date.now() + f.remaining * 1000; f.running = true; announce(`${f.mode === 'foco' ? 'Foco' : 'Pausa'} iniciado: ${Math.ceil(f.remaining / 60)} minutos.`); }
    render();
  },
  'focus-reset': () => { const f = ctx.ui.focus; f.running = false; f.remaining = (f.mode === 'foco' ? f.focusMin : f.breakMin) * 60; render(); announce('Cronômetro reiniciado.'); },
  'focus-skip': () => { const f = ctx.ui.focus; f.mode = f.mode === 'foco' ? 'pausa' : 'foco'; f.running = false; f.remaining = (f.mode === 'foco' ? f.focusMin : f.breakMin) * 60; render(); },

  // Ajustes
  'font-inc': () => setFont(store.get().a11y.fontScale + 0.1),
  'font-dec': () => setFont(store.get().a11y.fontScale - 0.1),
  'speak-test': () => A.speak('Olá! Esta é a voz que vai ler notícias, normas e notas para você.'),
  'speak-page': () => { location.hash = '#hoje'; setTimeout(() => A.speak(main.innerText), 200); },
  'a11y-reset': () => { store.update((s) => { s.a11y = store.defaults().a11y; }); A.apply(); render(); toast('Acessibilidade restaurada.'); },
  'ics-download': () => VA.downloadICS(),
  'notif-ask': async () => {
    try { const p = await Notification.requestPermission(); toast(p === 'granted' ? 'Notificações permitidas.' : 'Notificações não autorizadas.'); } catch { toast('Não foi possível pedir permissão.', { kind: 'error' }); }
    render();
  },
  'notif-test': () => { VP.notify('Teste de lembrete', 'Assim você será avisado para bater o ponto.', 'teste'); toast('Notificação de teste enviada.'); },
  copy: async (el) => { const ok = await copyText(el.dataset.text); toast(ok ? 'Copiado.' : 'Não foi possível copiar.', { kind: ok ? 'ok' : 'error' }); },
  'backup-export': () => VA.exportBackup(),
  'reset-all': async () => {
    if (!(await confirmDialog('Apagar todos os dados?', 'Ponto, escritórios, tarefas, notas e ajustes serão apagados deste aparelho. Exporte um backup antes se quiser guardar.', { ok: 'Apagar tudo', danger: true }))) return;
    store.resetAll(); A.apply(); ctx.lastLoc = null; location.hash = '#hoje'; render({ focus: true }); toast('Dados apagados.');
  },
  install: async () => { if (!ctx.installPrompt) return; ctx.installPrompt.prompt(); await ctx.installPrompt.userChoice; ctx.installPrompt = null; render(); },
  'a11y-quick': () => { location.hash = '#ajustes-acessibilidade'; },
};

function topicTag(t) { return { veiculos: 'Veículos', imoveis: 'Imóveis', regulatorio: 'Regulatório', trillia: 'Dados/Analytics' }[t] || 'Geral'; }

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.closest('#dlg')) return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  if (el.tagName === 'A' && (el.dataset.act === 'news-open' || el.dataset.act === 'norm-open')) { fn(el, e); return; }
  e.preventDefault();
  fn(el, e);
});

// Mudanças em campos (checkbox, select, range…)
const changes = {
  'task-toggle': (el) => {
    store.update((s) => { const t = s.tasks.find((x) => x.id === el.dataset.id); if (t) t.status = el.checked ? 'done' : 'todo'; });
    announce(el.checked ? 'Tarefa concluída.' : 'Tarefa reaberta.');
    if (el.checked) A.haptic(20);
    setTimeout(render, 250);
  },
  'news-topic': (el) => { ctx.ui.newsTopic = el.value; render(); },
  'news-saved': (el) => { ctx.ui.newsSaved = el.checked; render(); },
  'norms-filter': (el) => { ctx.ui.normsFilter = el.value; render(); },
  'a11y-theme': (el) => setA11y('theme', el.value),
  'a11y-font': (el) => setFont(Number(el.value)),
  'a11y-rate': (el) => setA11y('ttsRate', Number(el.value)),
  'a11y-voice': (el) => setA11y('ttsVoice', el.value),
  'rem-enabled': (el) => { store.update((s) => { s.settings.reminders.enabled = el.checked; }); VP.updateBadge(); },
  'rem-notify': (el) => store.update((s) => { s.settings.reminders.notify = el.checked; }),
  'rem-breaks': (el) => store.update((s) => { s.settings.reminders.breaks.on = el.checked; }),
  'rem-item-on': (el) => store.update((s) => { s.settings.reminders.items[Number(el.dataset.i)].on = el.checked; }),
  'rem-item-time': (el) => store.update((s) => { s.settings.reminders.items[Number(el.dataset.i)].time = el.value; }),
  'rem-tol': (el) => store.update((s) => { s.settings.reminders.tolerance = Math.max(0, Number(el.value) || 0); }),
  workday: () => {
    const days = [...main.querySelectorAll('input[data-change="workday"]:checked')].map((x) => Number(x.value));
    store.update((s) => { s.settings.workDays = days; });
  },
  'set-auto': (el) => store.update((s) => { s.settings.autoDetect = el.checked; }),
  'backup-import': (el) => { if (el.files?.[0]) VA.importBackup(el.files[0]); el.value = ''; },
  'focus-min': (el) => { const f = ctx.ui.focus; f.focusMin = Math.max(5, Number(el.value) || 25); if (!f.running && f.mode === 'foco') f.remaining = f.focusMin * 60; render(); },
  'break-min': (el) => { const f = ctx.ui.focus; f.breakMin = Math.max(1, Number(el.value) || 5); if (!f.running && f.mode === 'pausa') f.remaining = f.breakMin * 60; render(); },
};

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (!el || el.closest('#dlg')) return;
  const key = el.dataset.change;
  if (key.startsWith('a11y:')) { setA11y(key.slice(5), el.checked); return; }
  changes[key]?.(el, e);
});

// Busca enquanto digita
const inputs = {
  'news-q': debounce((el) => { ctx.ui.newsQuery = el.value; render(); }, 300),
  'norms-q': debounce((el) => { ctx.ui.normsQuery = el.value; render(); }, 300),
  'gloss-q': debounce((el) => { ctx.ui.glossQuery = el.value; render(); }, 250),
  'a11y-font-live': (el) => {
    document.documentElement.style.setProperty('--font-scale', el.value);
    const out = document.getElementById('fs-out');
    if (out) out.textContent = `${Math.round(el.value * 100)}%`;
  },
};
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (el && inputs[el.dataset.input]) inputs[el.dataset.input](el);
});

// Formulários
const forms = {
  'task-add': (f, data) => {
    if (!data.title.trim()) return;
    store.addTask(data);
    toast('Tarefa adicionada.', { kind: 'ok' });
    render();
    document.getElementById('task-title')?.focus();
  },
  'kw-add': (f, data) => {
    const k = data.kw.trim();
    if (!k) return;
    store.update((s) => { if (!s.settings.keywords.some((x) => x.toLowerCase() === k.toLowerCase())) s.settings.keywords.push(k); });
    render();
    document.getElementById('kw-new')?.focus();
    announce(`Palavra-chave ${k} adicionada.`);
  },
  calc: (f, data) => {
    ctx.ui.calc = { valor: Number(data.valor), entrada: Number(data.entrada || 0), taxa: Number(data.taxa), taxaTipo: data.taxaTipo, prazo: Number(data.prazo), sistema: data.sistema };
    render();
    document.getElementById('sr-t')?.focus?.();
  },
  settings: (f, data) => {
    store.update((s) => {
      s.profile.name = data.name.trim();
      s.profile.area = data.area.trim();
      s.settings.workMinutes = Math.round(Number(data.workHours) * 60) || 480;
      s.settings.lunchMinutes = Math.max(0, Number(data.lunch) || 0);
      s.settings.presencialGoal = Math.max(0, Math.min(7, Number(data.goal) || 0));
      s.settings.radiusDefault = Math.max(50, Number(data.radius) || 150);
    });
    toast('Ajustes salvos.', { kind: 'ok' });
    render();
  },
  'feed-url': (f, data) => { store.update((s) => { s.settings.feedUrl = data.url.trim(); }); loadFeed({ force: true }); },
};
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  forms[f.dataset.form]?.(f, Object.fromEntries(new FormData(f).entries()));
});

function setA11y(key, value) {
  store.update((s) => { s.a11y[key] = value; });
  A.apply();
  render();
  const labels = { contrast: 'Alto contraste', legible: 'Fonte legível', spacing: 'Espaçamento ampliado', underline: 'Links sublinhados', bigTargets: 'Botões maiores', reduceMotion: 'Animações reduzidas', haptics: 'Vibração', sound: 'Som', simple: 'Modo simplificado', vlibras: 'VLibras' };
  if (labels[key]) announce(`${labels[key]} ${value ? 'ativado' : 'desativado'}.`);
}

function setFont(v) {
  const val = Math.min(2, Math.max(0.85, Math.round(v * 100) / 100));
  setA11y('fontScale', val);
  announce(`Texto em ${Math.round(val * 100)} por cento.`);
}

// Atalhos de teclado (computador)
document.addEventListener('keydown', (e) => {
  if (!e.altKey || e.ctrlKey || e.metaKey) return;
  const k = e.key.toLowerCase();
  const map = { 1: '#hoje', 2: '#ponto', 3: '#mercado-noticias', 4: '#trabalho-tarefas', 5: '#ajustes-acessibilidade' };
  if (map[k]) { e.preventDefault(); location.hash = map[k]; }
  if (k === 'p') { e.preventDefault(); VP.punchFlow(); }
});

// ======================================================================
// Feed de notícias e normas
// ======================================================================
async function loadFeed({ force = false } = {}) {
  if (!ctx.feed) {
    try { const c = localStorage.getItem(FEED_CACHE); if (c) ctx.feed = JSON.parse(c); } catch { /* */ }
  }
  ctx.feedLoading = true; ctx.feedError = '';
  if (force) render();
  try {
    const url = store.get().settings.feedUrl || 'data/feed.json';
    const res = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    ctx.feed = data;
    try { localStorage.setItem(FEED_CACHE, JSON.stringify(data)); } catch { /* */ }
    if (force) toast(`Feed atualizado: ${(data.news || []).length} notícias, ${(data.normas || []).length} normas.`, { kind: 'ok' });
  } catch (e) {
    ctx.feedError = ctx.feed ? 'sem conexão — exibindo a última versão' : 'não foi possível carregar';
    if (force) toast('Não foi possível atualizar o feed agora.', { kind: 'error' });
  } finally {
    ctx.feedLoading = false;
    render();
  }
}

// ======================================================================
// Relógio, lembretes e pausas
// ======================================================================
let lastBreakAt = Date.now();

function tick() {
  const now = new Date();
  const c = document.querySelector('[data-tick="clock"]');
  if (c) c.textContent = hhmm(now);
  const w = document.querySelector('[data-tick="worked"]');
  if (w) {
    const m = P.workedMinutes(dayKey(now), now);
    w.textContent = fmtDuration(m);
    const bar = document.querySelector('[data-tick="worked-bar"]');
    if (bar) bar.style.width = `${Math.min(100, (m / Math.max(1, store.get().settings.workMinutes)) * 100)}%`;
  }
  VT.focusTick();
  checkReminders(now);
}

function checkReminders(now) {
  const s = store.get();
  const r = s.settings.reminders;
  if (!r.enabled || !P.isWorkDay(now)) return;
  const key = dayKey(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const list = P.punchesOf(key);
  const done = {
    entrada: list.some((p) => p.kind === 'entrada'),
    almoco: list.some((p) => p.kind === 'pausa_inicio') || !P.isOpen(key),
    retorno: list.some((p) => p.kind === 'pausa_fim') || !P.onBreak(key),
    saida: list.some((p) => p.kind === 'saida') || !list.length,
  };
  for (const it of r.items) {
    if (!it.on) continue;
    const t = timeToMin(it.time);
    const logKey = `${key}:${it.id}`;
    if (nowMin >= t && nowMin <= t + 90 && !done[it.id] && !s.reminderLog[logKey]) {
      store.update((st) => { st.reminderLog[logKey] = true; pruneLog(st); });
      A.beep('warn'); A.haptic([120, 60, 120]);
      toast(`⏰ ${it.label} (${it.time})`, { kind: 'warn', timeout: 0, action: { label: 'Registrar', fn: () => VP.punchFlow() } });
      VP.notify(`⏰ ${it.label}`, 'Toque para registrar o ponto.', `rem-${it.id}`);
      VP.updateBadge();
      if (ctx.route === 'hoje') render();
    }
  }
  // Pausas ativas
  if (r.breaks.on && P.isOpen(key) && !P.onBreak(key) && Date.now() - lastBreakAt > r.breaks.every * 60000) {
    lastBreakAt = Date.now();
    toast('Pausa ativa: levante, alongue e beba água. 💧', { kind: 'info', timeout: 12000 });
    VP.notify('Pausa ativa', 'Levante, alongue e beba água.', 'pausa');
  }
}

function pruneLog(st) {
  const keys = Object.keys(st.reminderLog);
  if (keys.length > 60) keys.sort().slice(0, keys.length - 40).forEach((k) => delete st.reminderLog[k]);
}

// ======================================================================
// Inicialização
// ======================================================================
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Nova versão disponível.', { timeout: 0, action: { label: 'Atualizar', fn: () => { nw.postMessage('skip'); location.reload(); } } });
        }
      });
    });
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'bater') handleBater();
    });
  } catch (e) { console.warn('SW', e); }
}

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); ctx.installPrompt = e; });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    tick();
    VP.autoDetect();
    if (ctx.feed?.updatedAt && Date.now() - new Date(ctx.feed.updatedAt).getTime() > 3 * 3600000) loadFeed();
  }
});

matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => A.apply());

function init() {
  A.apply();
  if (speechSynthesis?.addEventListener) speechSynthesis.addEventListener('voiceschanged', () => { if (ctx.route === 'ajustes') render(); });
  try { navigator.storage?.persist?.(); } catch { /* */ }
  if (location.hash === '#bater') handleBater(); else render({ focus: false });
  loadFeed();
  registerSW();
  setInterval(tick, 15000);
  setTimeout(tick, 1000);
  setInterval(() => VT.focusTick(), 1000);
  VP.autoDetect();
  VP.updateBadge();
  void uid; void esc; void icon; void openDialog;
}

init();
