// Componentes de interface acessíveis: ícones, diálogos, avisos e confirmação.

import { esc, announce } from './util.js';

export function icon(name, { label = '', cls = '' } = {}) {
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true" focusable="false"';
  return `<svg class="ico ${cls}" ${a11y}><use href="#i-${name}"/></svg>`;
}

// ---------- Avisos rápidos (toasts) ----------
export function toast(msg, { kind = 'info', timeout = 4500, action = null } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.innerHTML = `<span class="toast-msg">${esc(msg)}</span>${action ? `<button type="button" class="btn btn-sm btn-ghost-inv">${esc(action.label)}</button>` : ''}<button type="button" class="toast-x" aria-label="Fechar aviso">${icon('x')}</button>`;
  host.appendChild(el);
  announce(msg, { assertive: kind === 'error' });
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 250); };
  el.querySelector('.toast-x').onclick = close;
  if (action) el.querySelector('.btn').onclick = () => { action.fn(); close(); };
  if (timeout) setTimeout(close, timeout);
}

// ---------- Diálogo modal (usa <dialog>, que já gerencia foco e tecla Esc) ----------
let current = null;

/**
 * Abre um diálogo. `body` é HTML; botões com data-value fecham e resolvem com esse valor.
 * Formulários com data-dialog-form resolvem com um objeto dos campos.
 */
export function openDialog({ title, body, wide = false, onOpen, labelledby } = {}) {
  const dlg = document.getElementById('dlg');
  if (current) closeDialog(null);
  return new Promise((resolve) => {
    const tid = labelledby || 'dlg-title';
    dlg.className = wide ? 'dlg wide' : 'dlg';
    dlg.setAttribute('aria-labelledby', tid);
    dlg.innerHTML = `
      <div class="dlg-head">
        <h2 id="dlg-title" tabindex="-1">${esc(title)}</h2>
        <button type="button" class="icon-btn" data-value="" aria-label="Fechar">${icon('x')}</button>
      </div>
      <div class="dlg-body">${body}</div>`;
    current = { resolve, opener: document.activeElement };
    dlg.addEventListener('click', onClick);
    dlg.addEventListener('submit', onSubmit);
    dlg.addEventListener('cancel', onCancel);
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    const first = dlg.querySelector('[autofocus]') || dlg.querySelector('.dlg-body input, .dlg-body select, .dlg-body textarea, .dlg-body button, .dlg-body a') || dlg.querySelector('h2');
    setTimeout(() => first && first.focus(), 30);
    onOpen && onOpen(dlg);
  });
}

function onClick(e) {
  const b = e.target.closest('[data-value]');
  if (b && b.closest('#dlg')) {
    if (b.type === 'submit') return; // tratado no submit
    e.preventDefault();
    closeDialog(b.dataset.value === '' ? null : b.dataset.value);
  } else if (e.target.id === 'dlg') {
    // clique no fundo
    const r = e.target.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) closeDialog(null);
  }
}

function onSubmit(e) {
  const form = e.target.closest('form[data-dialog-form]');
  if (!form) return;
  e.preventDefault();
  if (!form.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form).entries());
  // checkboxes múltiplos
  form.querySelectorAll('input[type=checkbox][data-multi]').forEach((cb) => {
    data[cb.name] = [...form.querySelectorAll(`input[name="${cb.name}"]:checked`)].map((x) => x.value);
  });
  const submitter = e.submitter;
  if (submitter && submitter.dataset.value) data._action = submitter.dataset.value;
  closeDialog(data);
}

function onCancel(e) {
  e.preventDefault();
  closeDialog(null);
}

export function closeDialog(value) {
  const dlg = document.getElementById('dlg');
  if (!current) return;
  const { resolve, opener } = current;
  current = null;
  dlg.removeEventListener('click', onClick);
  dlg.removeEventListener('submit', onSubmit);
  dlg.removeEventListener('cancel', onCancel);
  if (dlg.open) dlg.close();
  dlg.innerHTML = '';
  if (opener && document.contains(opener)) opener.focus();
  resolve(value);
}

export function dialogEl() { return document.getElementById('dlg'); }

export async function confirmDialog(title, text, { ok = 'Confirmar', danger = false, cancel = 'Cancelar' } = {}) {
  const r = await openDialog({
    title,
    body: `<p>${esc(text)}</p>
      <div class="dlg-actions">
        <button type="button" class="btn btn-ghost" data-value="">${esc(cancel)}</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-value="ok" autofocus>${esc(ok)}</button>
      </div>`,
  });
  return r === 'ok';
}

export function busy(text) {
  const el = document.getElementById('busy');
  if (!el) return () => {};
  el.querySelector('.busy-text').textContent = text;
  el.hidden = false;
  announce(text);
  return () => { el.hidden = true; };
}

export function segmented(name, options, value, { label = '', act = '' } = {}) {
  return `<div class="seg" role="radiogroup" aria-label="${esc(label)}">${options.map((o) => `
    <label class="seg-opt"><input type="radio" name="${esc(name)}" value="${esc(o.value)}" ${o.value === value ? 'checked' : ''} ${act ? `data-change="${esc(act)}"` : ''}><span>${esc(o.label)}</span></label>`).join('')}
  </div>`;
}

export function toggle({ id, label, checked, act, hint = '' }) {
  return `<div class="field-toggle">
    <label class="switch" for="${esc(id)}">
      <span class="switch-text"><span class="switch-label">${esc(label)}</span>${hint ? `<span class="hint" id="${esc(id)}-hint">${esc(hint)}</span>` : ''}</span>
      <input type="checkbox" role="switch" id="${esc(id)}" ${checked ? 'checked' : ''} data-change="${esc(act)}" ${hint ? `aria-describedby="${esc(id)}-hint"` : ''}>
      <span class="switch-ui" aria-hidden="true"></span>
    </label>
  </div>`;
}

export function subnav(base, items, current) {
  return `<nav class="subnav" aria-label="Seções">
    <ul>${items.map((i) => `<li><a href="#${base}-${i.id}" ${i.id === current ? 'aria-current="page"' : ''}>${icon(i.icon)}<span>${esc(i.label)}</span>${i.badge ? `<span class="badge" aria-label="${esc(i.badgeLabel || i.badge)}">${esc(i.badge)}</span>` : ''}</a></li>`).join('')}</ul>
  </nav>`;
}

export function emptyState(iconName, title, text, action = '') {
  return `<div class="empty">${icon(iconName, { cls: 'ico-xl' })}<p class="empty-title">${esc(title)}</p><p class="muted">${esc(text)}</p>${action}</div>`;
}
