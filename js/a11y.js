// Recursos de acessibilidade: tema, contraste, tamanho de texto, fonte legível,
// espaçamento, redução de movimento, leitura em voz alta, VLibras, vibração e sons.

import * as store from './store.js';
import { announce } from './util.js';

export function apply() {
  const a = store.get().a11y;
  const root = document.documentElement;
  root.style.setProperty('--font-scale', String(a.fontScale || 1));
  const dark = a.theme === 'escuro' || (a.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.classList.toggle('hc', !!a.contrast);
  root.classList.toggle('legible', !!a.legible);
  root.classList.toggle('spacing', !!a.spacing);
  root.classList.toggle('reduce-motion', !!a.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches);
  root.classList.toggle('underline-links', !!a.underline);
  root.classList.toggle('big-targets', !!a.bigTargets);
  root.classList.toggle('simple', !!a.simple);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', a.contrast ? '#000000' : (dark ? '#06112A' : '#0A1E46'));
  if (a.legible) loadLegibleFont();
  if (a.vlibras) loadVLibras(); else hideVLibras();
}

let fontLoaded = false;
function loadLegibleFont() {
  if (fontLoaded) return;
  fontLoaded = true;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&display=swap';
  document.head.appendChild(l);
}

// ---------- VLibras (tradução para Libras do Governo Federal) ----------
let vlibrasLoaded = false;
export function loadVLibras() {
  const wrap = document.getElementById('vlibras');
  if (wrap) wrap.hidden = false;
  if (vlibrasLoaded) return;
  vlibrasLoaded = true;
  const s = document.createElement('script');
  s.src = 'https://vlibras.gov.br/app/vlibras-plugin.js';
  s.onload = () => {
    try { new window.VLibras.Widget('https://vlibras.gov.br/app'); } catch (e) { console.warn(e); }
    // O widget espera o evento load da janela
    try { window.dispatchEvent(new Event('load')); } catch { /* */ }
  };
  s.onerror = () => announce('Não foi possível carregar o VLibras. Verifique a conexão.');
  document.body.appendChild(s);
}
function hideVLibras() {
  const wrap = document.getElementById('vlibras');
  if (wrap) wrap.hidden = true;
}

// ---------- Leitura em voz alta ----------
export const ttsSupported = () => 'speechSynthesis' in window;

export function voices() {
  if (!ttsSupported()) return [];
  return speechSynthesis.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith('pt'));
}

export function speak(text, { onend } = {}) {
  if (!ttsSupported()) { announce('Leitura em voz alta não disponível neste aparelho.'); return; }
  stopSpeaking();
  const a = store.get().a11y;
  const chunks = String(text).replace(/\s+/g, ' ').match(/[^.!?;:]+[.!?;:]?/g) || [text];
  let i = 0;
  const next = () => {
    if (i >= chunks.length) { onend && onend(); return; }
    const u = new SpeechSynthesisUtterance(chunks[i++].trim());
    u.lang = 'pt-BR';
    u.rate = a.ttsRate || 1;
    const v = voices().find((x) => x.name === a.ttsVoice) || voices().find((x) => x.lang === 'pt-BR');
    if (v) u.voice = v;
    u.onend = next;
    u.onerror = next;
    speechSynthesis.speak(u);
  };
  next();
}

export function stopSpeaking() {
  if (ttsSupported()) speechSynthesis.cancel();
}

export function speaking() {
  return ttsSupported() && speechSynthesis.speaking;
}

// ---------- Ditado por voz ----------
export function dictationSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function dictate(onText, onEnd) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { announce('Ditado por voz não disponível neste navegador. Use o microfone do teclado do celular.'); return null; }
  const r = new SR();
  r.lang = 'pt-BR';
  r.interimResults = false;
  r.continuous = true;
  r.onresult = (e) => {
    let t = '';
    for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) t += e.results[i][0].transcript;
    if (t) onText(t);
  };
  r.onend = () => onEnd && onEnd();
  r.onerror = () => onEnd && onEnd();
  r.start();
  return r;
}

// ---------- Retorno tátil e sonoro ----------
export function haptic(pattern = 30) {
  if (!store.get().a11y.haptics) return;
  try { navigator.vibrate && navigator.vibrate(pattern); } catch { /* */ }
}

let ctx;
export function beep(kind = 'ok') {
  if (!store.get().a11y.sound) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = kind === 'ok' ? [660, 880] : kind === 'warn' ? [440, 330] : [520];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t = ctx.currentTime + i * 0.14;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.14);
    });
  } catch { /* */ }
}
