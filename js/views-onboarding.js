// Configuração guiada (primeiro uso): nome, cota presencial, modalidades, jornada/lembretes e escritório.

import * as store from './store.js';
import * as P from './ponto.js';
import { ctx } from './ctx.js';
import { openDialog, segmented, icon, toast } from './ui.js';
import { esc, announce } from './util.js';
import { officeDialog, locateNow } from './views-ponto.js';

const TOTAL = 5;

function frame(step, inner, { canBack = true, nextLabel = 'Continuar' } = {}) {
  return `
    <div class="wizard">
      <p class="wizard-step" aria-hidden="true">${Array.from({ length: TOTAL }, (_, i) => `<span class="${i < step ? 'on' : ''}"></span>`).join('')}</p>
      <p class="visually-hidden">Passo ${step} de ${TOTAL}</p>
      <form data-dialog-form class="form">
        ${inner}
        <div class="dlg-actions wizard-actions">
          ${canBack ? `<button type="submit" class="btn btn-ghost" data-value="back" formnovalidate>${icon('chev-left')} Voltar</button>` : ''}
          <button type="submit" class="btn btn-primary btn-lg" data-value="next">${esc(nextLabel)} ${icon('chev-right')}</button>
        </div>
      </form>
    </div>`;
}

export async function runOnboarding() {
  let step = 1;
  while (step >= 1 && step <= TOTAL) {
    const r = await stepDialog(step);
    if (r === null) { // fechou ou "pular"
      store.update((s) => { s.onboarded = true; });
      toast('Tudo bem! Você pode refazer a configuração em Ajustes → Jornada.');
      ctx.render();
      return;
    }
    if (r === 'stay') continue;
    step += r === 'back' ? -1 : 1;
  }
  store.update((s) => { s.onboarded = true; });
  toast('Tudo pronto! Bom trabalho. 🙂', { kind: 'ok' });
  location.hash = '#hoje';
  ctx.render();
}

async function stepDialog(step) {
  const s = store.get();
  if (step === 1) {
    const r = await openDialog({
      title: 'Boas-vindas à sua Rotina',
      body: frame(1, `
        <p>Vamos configurar o app em 5 passos rápidos. Você pode mudar tudo depois em Ajustes.</p>
        <label class="field"><span>Como você quer ser chamado?</span><input name="name" value="${esc(s.profile.name)}" autocomplete="given-name" maxlength="40" autofocus></label>
        <label class="field"><span>Sua área</span><input name="area" value="${esc(s.profile.area)}" maxlength="80"></label>`, { canBack: false }),
    });
    if (!r) return null;
    store.update((st) => { st.profile.name = (r.name || '').trim(); st.profile.area = (r.area || '').trim(); });
    return r._action || 'next';
  }
  if (step === 2) {
    const cfg = s.settings.presence;
    const r = await openDialog({
      title: 'Sua cota presencial',
      body: frame(2, `
        <p>Como a empresa define sua presença no escritório?</p>
        <fieldset class="fieldset"><legend>Tipo de meta</legend>
          ${segmented('type', [{ value: 'pct_mes', label: '% dos dias úteis do mês' }, { value: 'dias_semana', label: 'Dias por semana' }, { value: 'dias_mes', label: 'Dias por mês' }], cfg.type, { label: 'Tipo de meta' })}
        </fieldset>
        <label class="field" data-for="pct_mes"><span>Percentual de dias presenciais (%)</span><input type="number" name="pct" min="0" max="100" step="1" value="${cfg.pct}"></label>
        <label class="field" data-for="dias_semana"><span>Dias presenciais por semana</span><input type="number" name="daysWeek" min="0" max="7" value="${cfg.daysWeek}"></label>
        <label class="field" data-for="dias_mes"><span>Dias presenciais por mês</span><input type="number" name="daysMonth" min="0" max="31" value="${cfg.daysMonth}"></label>
        <p class="hint">Feriados nacionais e de São Paulo já são descontados automaticamente dos dias úteis.</p>`),
      onOpen: (dlg) => {
        const sync = () => {
          const v = dlg.querySelector('input[name=type]:checked')?.value || 'pct_mes';
          dlg.querySelectorAll('[data-for]').forEach((el) => { el.hidden = el.dataset.for !== v; });
        };
        dlg.querySelectorAll('input[name=type]').forEach((r) => r.addEventListener('change', sync));
        sync();
      },
    });
    if (!r) return null;
    if (r._action !== 'back') {
      store.update((st) => {
        Object.assign(st.settings.presence, {
          type: r.type || cfg.type,
          pct: clamp(r.pct, 0, 100, cfg.pct),
          daysWeek: clamp(r.daysWeek, 0, 7, cfg.daysWeek),
          daysMonth: clamp(r.daysMonth, 0, 31, cfg.daysMonth),
        });
      });
    }
    return r._action || 'next';
  }
  if (step === 3) {
    const modes = s.settings.modes;
    const r = await openDialog({
      title: 'Como você trabalha?',
      body: frame(3, `
        <p>Marque as modalidades que você usa e quais contam como presencial para a cota.</p>
        <table class="wizard-table">
          <caption class="visually-hidden">Modalidades</caption>
          <thead><tr><th scope="col">Modalidade</th><th scope="col">Uso</th><th scope="col">Conta na cota</th></tr></thead>
          <tbody>${modes.map((m) => `<tr>
            <th scope="row"><span class="chip-mini tone-${esc(m.tone)}" aria-hidden="true">${esc(m.short)}</span> ${esc(m.label)}</th>
            <td><input type="checkbox" name="on" value="${esc(m.id)}" data-multi ${m.on ? 'checked' : ''} ${m.id === 'presencial' ? 'disabled checked' : ''} aria-label="Uso ${esc(m.label)}"></td>
            <td><input type="checkbox" name="counts" value="${esc(m.id)}" data-multi ${m.counts ? 'checked' : ''} ${m.id === 'presencial' ? 'disabled checked' : ''} aria-label="${esc(m.label)} conta na cota"></td>
          </tr>`).join('')}</tbody>
        </table>
        <p class="hint">Você pode criar outras (viagem, cliente, treinamento…) em Ajustes → Presença.</p>`),
    });
    if (!r) return null;
    if (r._action !== 'back') {
      const on = new Set(r.on || []); const counts = new Set(r.counts || []);
      store.update((st) => {
        st.settings.modes.forEach((m) => {
          if (m.id === 'presencial') return;
          m.on = on.has(m.id);
          m.counts = counts.has(m.id);
        });
      });
    }
    return r._action || 'next';
  }
  if (step === 4) {
    const st = s.settings;
    const ent = st.reminders.items.find((i) => i.id === 'entrada');
    const sai = st.reminders.items.find((i) => i.id === 'saida');
    const r = await openDialog({
      title: 'Jornada e lembretes',
      body: frame(4, `
        <div class="grid-2">
          <label class="field"><span>Jornada diária (horas)</span><input type="number" name="hours" min="1" max="12" step="0.25" value="${st.workMinutes / 60}"></label>
          <label class="field"><span>Almoço (minutos)</span><input type="number" name="lunch" min="0" max="180" step="5" value="${st.lunchMinutes}"></label>
          <label class="field"><span>Lembrete de entrada</span><input type="time" name="ent" value="${esc(ent.time)}"></label>
          <label class="field"><span>Lembrete de saída</span><input type="time" name="sai" value="${esc(sai.time)}"></label>
        </div>
        <fieldset class="fieldset"><legend>Dias de trabalho</legend>
          <div class="days">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<label class="day-chip"><input type="checkbox" name="days" value="${d}" data-multi ${st.workDays.includes(d) ? 'checked' : ''}><span>${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d]}</span></label>`).join('')}</div>
        </fieldset>
        <p class="hint">O almoço é descontado automaticamente nos dias trabalhados, mesmo sem marcar o intervalo. Depois, em Ajustes → Lembretes, toque em "Adicionar ao calendário" para receber o aviso todo dia, mesmo com o app fechado.</p>`),
    });
    if (!r) return null;
    if (r._action !== 'back') {
      store.update((x) => {
        x.settings.workMinutes = Math.round(clamp(r.hours, 1, 12, 8) * 60);
        x.settings.lunchMinutes = clamp(r.lunch, 0, 180, 60);
        x.settings.reminders.items.find((i) => i.id === 'entrada').time = r.ent || ent.time;
        x.settings.reminders.items.find((i) => i.id === 'saida').time = r.sai || sai.time;
        if (r.days && r.days.length) x.settings.workDays = r.days.map(Number);
      });
    }
    return r._action || 'next';
  }
  if (step === 5) {
    const r = await openDialog({
      title: 'Seus escritórios',
      body: frame(5, `
        <p>Para validar o presencial, cadastre onde você trabalha. ${s.offices.length ? `Você já tem <strong>${s.offices.length}</strong> ${s.offices.length === 1 ? 'escritório' : 'escritórios'}.` : ''}</p>
        <div class="row-btns">
          <button type="submit" class="btn btn-ghost" data-value="here">${icon('pin')} Estou no escritório agora</button>
          <button type="submit" class="btn btn-ghost" data-value="search">${icon('search')} Buscar pelo endereço</button>
        </div>
        <p class="hint">Pode deixar para depois: o app avisa na tela inicial.</p>`, { nextLabel: 'Concluir' }),
    });
    if (!r) return null;
    if (r._action === 'here') {
      const pos = await locateNow();
      if (pos) await officeDialog(null, pos); else announce(ctx.locError || 'Não foi possível obter a localização.');
      return 'stay';
    }
    if (r._action === 'search') { await officeDialog(null); return 'stay'; }
    return r._action || 'next';
  }
  return 'next';
}

function clamp(v, min, max, dflt) {
  const n = Number(v);
  if (Number.isNaN(n) || v === '' || v == null) return dflt;
  return Math.min(max, Math.max(min, n));
}

void P;
