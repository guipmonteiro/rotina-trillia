// Ajustes: acessibilidade, lembretes, escritórios, jornada, dados e instalação.

import * as store from './store.js';
import * as A from './a11y.js';
import { ctx } from './ctx.js';
import { icon, toast, subnav, toggle, segmented, emptyState, confirmDialog } from './ui.js';
import { esc, WEEKDAYS, shareOrDownload, downloadFile, fmtDistance } from './util.js';
import { buildICS } from './ics.js';
import { DEFAULT_KEYWORDS } from './store.js';

export function renderAjustes(sub = 'acessibilidade') {
  const items = [
    { id: 'acessibilidade', label: 'Acessibilidade', icon: 'a11y' },
    { id: 'lembretes', label: 'Lembretes', icon: 'bell' },
    { id: 'escritorios', label: 'Escritórios', icon: 'building' },
    { id: 'jornada', label: 'Jornada', icon: 'clock' },
    { id: 'dados', label: 'Dados', icon: 'download' },
    { id: 'instalar', label: 'Instalar', icon: 'phone' },
  ];
  const titles = { acessibilidade: 'Acessibilidade', lembretes: 'Lembretes de ponto', escritorios: 'Escritórios', jornada: 'Jornada e presença', dados: 'Dados e privacidade', instalar: 'Instalar no celular' };
  const body = { acessibilidade, lembretes, escritorios, jornada, dados, instalar }[sub] || acessibilidade;
  return `
  <header class="page-head"><p class="eyebrow">Ajustes</p><h1 tabindex="-1">${titles[sub] || titles.acessibilidade}</h1></header>
  ${subnav('ajustes', items, sub)}
  ${body()}`;
}

// ---------------- Acessibilidade ----------------
function acessibilidade() {
  const a = store.get().a11y;
  const voices = A.voices();
  return `
  <section class="card" aria-labelledby="vis-t">
    <h2 id="vis-t">${icon('eye')} Visão</h2>
    <div class="field">
      <label for="font-scale">Tamanho do texto: <output id="fs-out">${Math.round(a.fontScale * 100)}%</output></label>
      <div class="input-row">
        <button type="button" class="icon-btn" data-act="font-dec"><span aria-hidden="true">A−</span><span class="visually-hidden">Diminuir texto</span></button>
        <input type="range" id="font-scale" min="0.85" max="2" step="0.05" value="${a.fontScale}" data-change="a11y-font" data-input="a11y-font-live" aria-valuetext="${Math.round(a.fontScale * 100)} por cento">
        <button type="button" class="icon-btn" data-act="font-inc"><span aria-hidden="true">A+</span><span class="visually-hidden">Aumentar texto</span></button>
      </div>
    </div>
    <fieldset class="fieldset"><legend>Tema</legend>
      ${segmented('theme', [{ value: 'auto', label: 'Automático' }, { value: 'claro', label: 'Claro' }, { value: 'escuro', label: 'Escuro' }], a.theme, { label: 'Tema', act: 'a11y-theme' })}
    </fieldset>
    ${toggle({ id: 'a-contrast', label: 'Alto contraste', checked: a.contrast, act: 'a11y:contrast', hint: 'Preto, branco e amarelo, com bordas reforçadas.' })}
    ${toggle({ id: 'a-legible', label: 'Fonte de alta legibilidade', checked: a.legible, act: 'a11y:legible', hint: 'Atkinson Hyperlegible, criada para pessoas com baixa visão.' })}
    ${toggle({ id: 'a-spacing', label: 'Espaçamento ampliado', checked: a.spacing, act: 'a11y:spacing', hint: 'Mais espaço entre linhas, letras e palavras (ajuda na dislexia).' })}
    ${toggle({ id: 'a-underline', label: 'Sublinhar todos os links', checked: a.underline, act: 'a11y:underline' })}
  </section>

  <section class="card" aria-labelledby="mot-t">
    <h2 id="mot-t">${icon('hand')} Toque e movimento</h2>
    ${toggle({ id: 'a-big', label: 'Botões maiores', checked: a.bigTargets, act: 'a11y:bigTargets', hint: 'Áreas de toque de pelo menos 56 px.' })}
    ${toggle({ id: 'a-motion', label: 'Reduzir animações', checked: a.reduceMotion, act: 'a11y:reduceMotion' })}
    ${toggle({ id: 'a-haptics', label: 'Vibração ao confirmar', checked: a.haptics, act: 'a11y:haptics', hint: 'Disponível em celulares Android.' })}
    ${toggle({ id: 'a-sound', label: 'Som de confirmação', checked: a.sound, act: 'a11y:sound' })}
  </section>

  <section class="card" aria-labelledby="cog-t">
    <h2 id="cog-t">${icon('brain')} Leitura e foco</h2>
    ${toggle({ id: 'a-simple', label: 'Modo simplificado', checked: a.simple, act: 'a11y:simple', hint: 'Esconde blocos secundários da tela inicial e reduz distrações.' })}
    <div class="field">
      <label for="tts-rate">Velocidade da voz: <output>${a.ttsRate.toFixed(1).replace('.', ',')}×</output></label>
      <input type="range" id="tts-rate" min="0.6" max="1.8" step="0.1" value="${a.ttsRate}" data-change="a11y-rate">
    </div>
    ${voices.length ? `<label class="field"><span>Voz</span><select data-change="a11y-voice"><option value="">Padrão do aparelho</option>${voices.map((v) => `<option ${v.name === a.ttsVoice ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>` : ''}
    <div class="row-btns">
      <button type="button" class="btn btn-ghost" data-act="speak-test">${icon('speaker')} Testar voz</button>
      <button type="button" class="btn btn-ghost" data-act="speak-page">${icon('speaker')} Ler a tela inicial</button>
    </div>
  </section>

  <section class="card" aria-labelledby="lib-t">
    <h2 id="lib-t">${icon('hand')} Libras</h2>
    ${toggle({ id: 'a-vlibras', label: 'Tradutor VLibras', checked: a.vlibras, act: 'a11y:vlibras', hint: 'Widget oficial do Governo Federal que traduz textos para Libras. Requer internet.' })}
  </section>

  <section class="card" aria-labelledby="sr-t2">
    <h2 id="sr-t2">${icon('info')} Leitores de tela e teclado</h2>
    <ul class="bullets">
      <li>Compatível com VoiceOver (iPhone) e TalkBack (Android): todos os botões têm rótulos, as telas têm títulos e as confirmações são anunciadas.</li>
      <li>O calendário de presença usa tabela com descrição falada de cada dia.</li>
      <li>Nada depende só de cor: modalidades têm letra (P, R, E) e texto.</li>
      <li>No computador: <kbd>Tab</kbd> navega, <kbd>Esc</kbd> fecha janelas, <kbd>Alt</kbd>+<kbd>P</kbd> bate o ponto, <kbd>Alt</kbd>+<kbd>1</kbd>…<kbd>5</kbd> trocam de aba.</li>
      <li>O app respeita as preferências do sistema de tema escuro e redução de movimento.</li>
    </ul>
    <button type="button" class="btn btn-ghost" data-act="a11y-reset">${icon('refresh')} Restaurar padrões de acessibilidade</button>
  </section>`;
}

// ---------------- Lembretes ----------------
function lembretes() {
  const s = store.get();
  const r = s.settings.reminders;
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const appUrl = location.href.split('#')[0];
  return `
  <section class="card card-accent" aria-labelledby="cal-t">
    <h2 id="cal-t">${icon('calendar')} Lembrete diário garantido</h2>
    <p>Para receber o aviso <strong>todos os dias, mesmo com o app fechado</strong>, adicione os lembretes ao calendário do celular. Eles se repetem nos dias de trabalho e trazem o link que já abre o registro de ponto.</p>
    <div class="row-btns">
      <button type="button" class="btn btn-primary" data-act="ics-download">${icon('calendar')} Adicionar ao calendário</button>
    </div>
    <p class="hint">No iPhone, abra o arquivo e toque em "Adicionar tudo". No Android, abra com o Google Agenda. Se mudar os horários, gere de novo e apague a versão antiga.</p>
  </section>

  <section class="card" aria-labelledby="rem-t">
    <h2 id="rem-t">${icon('bell')} Horários</h2>
    ${toggle({ id: 'r-on', label: 'Lembretes ligados', checked: r.enabled, act: 'rem-enabled' })}
    <ul class="rem-list">${r.items.map((it, i) => `
      <li>
        <label class="check-inline"><input type="checkbox" data-change="rem-item-on" data-i="${i}" ${it.on ? 'checked' : ''}> ${esc(it.label)}</label>
        <label class="visually-hidden" for="rem-t-${i}">Horário: ${esc(it.label)}</label>
        <input type="time" id="rem-t-${i}" value="${esc(it.time)}" data-change="rem-item-time" data-i="${i}">
      </li>`).join('')}</ul>
    <label class="field"><span>Tolerância para considerar atrasado (min)</span><input type="number" min="0" max="60" value="${r.tolerance}" data-change="rem-tol"></label>
    <fieldset class="fieldset"><legend>Dias de trabalho</legend>
      <div class="days">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<label class="day-chip"><input type="checkbox" data-change="workday" value="${d}" ${s.settings.workDays.includes(d) ? 'checked' : ''}><span>${WEEKDAYS[d].slice(0, 3)}</span></label>`).join('')}</div>
    </fieldset>
  </section>

  <section class="card" aria-labelledby="push-t">
    <h2 id="push-t">${icon('bell')} Notificações do app</h2>
    <p class="muted small">Aparecem quando o app está aberto ou em segundo plano recente${/iPhone|iPad/.test(navigator.userAgent) ? ' (no iPhone, só depois de instalar na Tela de Início)' : ''}. Para o lembrete diário garantido, use o calendário acima.</p>
    <p>Status: <strong>${perm === 'granted' ? 'permitidas' : perm === 'denied' ? 'bloqueadas nas configurações' : perm === 'unsupported' ? 'não suportadas neste navegador' : 'ainda não autorizadas'}</strong></p>
    ${perm === 'default' ? `<button type="button" class="btn btn-ghost" data-act="notif-ask">${icon('bell')} Permitir notificações</button>` : ''}
    ${perm === 'granted' ? `<button type="button" class="btn btn-ghost" data-act="notif-test">${icon('bell')} Enviar teste</button>` : ''}
    ${toggle({ id: 'r-notify', label: 'Notificar nos horários', checked: r.notify, act: 'rem-notify' })}
    ${toggle({ id: 'r-breaks', label: 'Pausas ativas durante o expediente', checked: r.breaks.on, act: 'rem-breaks', hint: `Lembra de alongar, levantar e beber água a cada ${r.breaks.every} minutos.` })}
  </section>

  <section class="card" aria-labelledby="geo-t">
    <h2 id="geo-t">${icon('pin')} Aviso ao chegar no escritório (iPhone)</h2>
    <p>O iPhone pode avisar automaticamente quando você <strong>chegar</strong> ou <strong>sair</strong> do escritório, usando o app <strong>Atalhos</strong>:</p>
    <ol class="steps">
      <li>Abra <strong>Atalhos</strong> → aba <strong>Automação</strong> → <strong>Nova automação</strong> (ou o botão +).</li>
      <li>Escolha <strong>Chegar</strong>, selecione o endereço do escritório e marque <strong>Executar imediatamente</strong>.</li>
      <li>Adicione a ação <strong>Abrir URLs</strong> com o endereço abaixo (ou <strong>Mostrar notificação</strong> "Bater o ponto").</li>
      <li>Repita com <strong>Sair</strong> para lembrar a saída.</li>
    </ol>
    <div class="code-copy"><code>${esc(appUrl)}#bater</code><button type="button" class="btn btn-sm btn-ghost" data-act="copy" data-text="${esc(appUrl)}#bater">${icon('copy')} Copiar</button></div>
    <p class="hint">Esse link abre o app já validando a localização e pedindo a confirmação da marcação. No Android, o mesmo pode ser feito com rotinas do Google/Samsung ou com o app Tasker.</p>
  </section>`;
}

export function downloadICS() {
  const s = store.get();
  const items = s.settings.reminders.items.filter((i) => i.on);
  if (!items.length) { toast('Ligue pelo menos um horário de lembrete.', { kind: 'error' }); return; }
  const ics = buildICS({ items, workDays: s.settings.workDays, appUrl: location.href.split('#')[0] });
  shareOrDownload('lembretes-ponto.ics', ics, 'text/calendar');
}

// ---------------- Escritórios ----------------
function escritorios() {
  const s = store.get();
  const L = ctx.lastLoc;
  return `
  <div class="row-btns">
    <button type="button" class="btn btn-primary" data-act="office-add-here">${icon('pin')} Cadastrar onde estou</button>
    <button type="button" class="btn btn-ghost" data-act="office-add">${icon('search')} Buscar endereço</button>
  </div>
  ${s.offices.length ? `<ul class="office-cards">${s.offices.map((o) => {
    const r = L?.ranked?.find((x) => x.office.id === o.id);
    return `<li class="card office-card">
      <div><h2>${esc(o.name)}</h2>
        <p class="muted">${esc(o.address || 'Endereço não informado')}</p>
        <p class="small">Raio de presença: <strong>${o.radius} m</strong> · ${o.lat.toFixed(5)}, ${o.lng.toFixed(5)}</p>
        ${r ? `<p class="small ${r.inside ? 'ok-text' : 'muted'}">${r.inside ? 'Você está aqui agora' : `Você está a ${fmtDistance(r.dist)}`}</p>` : ''}
      </div>
      <div class="row-btns">
        <button type="button" class="btn btn-sm btn-ghost" data-act="office-edit" data-id="${o.id}" aria-label="Editar ${esc(o.name)}">${icon('edit')} Editar</button>
        <a class="btn btn-sm btn-ghost" href="https://www.google.com/maps/search/?api=1&query=${o.lat},${o.lng}" target="_blank" rel="noopener">${icon('map')} Mapa</a>
      </div>
    </li>`;
  }).join('')}</ul>` : emptyState('building', 'Nenhum escritório cadastrado', 'Cadastre a sede e as demais unidades onde você trabalha. Você pode ter quantos quiser.')}
  <section class="card"><h2>${icon('info')} Como funciona a validação</h2>
    <ul class="bullets">
      <li>Ao bater o ponto, o app pega sua posição pelo GPS e calcula a distância até cada escritório.</li>
      <li>Se estiver dentro do raio (com tolerância de até 50 m pela precisão do GPS), a marcação é presencial.</li>
      <li>Fora do raio, você escolhe remoto ou externo; se marcar presencial mesmo assim, fica sinalizado "fora do raio".</li>
      <li>A localização fica salva só no seu celular, arredondada a cerca de 1 m.</li>
    </ul>
  </section>`;
}

// ---------------- Jornada ----------------
function jornada() {
  const s = store.get();
  const st = s.settings;
  return `
  <section class="card">
    <form class="form" data-form="settings">
      <label class="field"><span>Seu nome</span><input name="name" value="${esc(s.profile.name)}" autocomplete="name" maxlength="60"></label>
      <label class="field"><span>Área</span><input name="area" value="${esc(s.profile.area)}" maxlength="80"></label>
      <div class="grid-2">
        <label class="field"><span>Jornada diária (horas)</span><input type="number" name="workHours" min="1" max="12" step="0.25" value="${st.workMinutes / 60}"></label>
        <label class="field"><span>Intervalo (minutos)</span><input type="number" name="lunch" min="0" max="180" step="5" value="${st.lunchMinutes}"></label>
        <label class="field"><span>Meta de dias presenciais por semana</span><input type="number" name="goal" min="0" max="7" value="${st.presencialGoal}"></label>
        <label class="field"><span>Raio padrão de novos escritórios (m)</span><input type="number" name="radius" min="50" max="1000" step="25" value="${st.radiusDefault}"></label>
      </div>
      ${toggle({ id: 's-auto', label: 'Verificar localização ao abrir o app', checked: st.autoDetect, act: 'set-auto', hint: 'Sugere registrar entrada ao chegar no escritório e saída ao se afastar.' })}
      <button type="submit" class="btn btn-primary">${icon('check')} Salvar</button>
    </form>
  </section>`;
}

// ---------------- Dados ----------------
function dados() {
  const s = store.get();
  return `
  <section class="card" aria-labelledby="bk-t">
    <h2 id="bk-t">${icon('download')} Backup</h2>
    <p>Todos os dados (ponto, escritórios, tarefas, notas) ficam <strong>apenas neste aparelho</strong>. Faça backup de tempos em tempos ou antes de trocar de celular.</p>
    <p class="muted small">${s.punches.length} marcações · ${s.offices.length} escritórios · ${s.tasks.length} tarefas · ${s.notes.length} notas</p>
    <div class="row-btns">
      <button type="button" class="btn btn-primary" data-act="backup-export">${icon('download')} Exportar backup</button>
      <label class="btn btn-ghost file-btn">${icon('upload')} Restaurar backup<input type="file" accept="application/json,.json" data-change="backup-import" class="visually-hidden"></label>
    </div>
  </section>
  <section class="card" aria-labelledby="fd-t">
    <h2 id="fd-t">${icon('news')} Fonte das notícias e normas</h2>
    <form class="form" data-form="feed-url">
      <label class="field"><span>Endereço do feed (JSON)</span><input name="url" value="${esc(s.settings.feedUrl)}" required></label>
      <p class="hint">Padrão: <code>data/feed.json</code>, atualizado automaticamente pelo robô do repositório.</p>
      <button type="submit" class="btn btn-ghost">${icon('check')} Salvar</button>
    </form>
    <button type="button" class="btn btn-sm btn-ghost" data-act="kw-reset">${icon('refresh')} Restaurar palavras-chave padrão (${DEFAULT_KEYWORDS.length})</button>
  </section>
  <section class="card" aria-labelledby="pv-t">
    <h2 id="pv-t">${icon('lock')} Privacidade</h2>
    <ul class="bullets">
      <li>Sem login, sem servidor próprio: nada sai do celular, exceto as buscas de endereço (OpenStreetMap) e o download do feed público.</li>
      <li>Este app é uma ferramenta pessoal de controle e não substitui o sistema oficial de ponto da empresa.</li>
    </ul>
    <button type="button" class="btn btn-danger-ghost" data-act="reset-all">${icon('trash')} Apagar todos os dados</button>
  </section>`;
}

export function exportBackup() {
  const name = `rotina-trillia-backup-${new Date().toISOString().slice(0, 10)}.json`;
  downloadFile(name, store.exportJSON(), 'application/json');
  toast('Backup exportado.', { kind: 'ok' });
}

export async function importBackup(file) {
  try {
    const text = await file.text();
    if (!(await confirmDialog('Restaurar backup?', 'Os dados atuais deste aparelho serão substituídos pelos do arquivo.', { ok: 'Restaurar', danger: true }))) return;
    store.importJSON(text);
    A.apply();
    toast('Backup restaurado.', { kind: 'ok' });
    ctx.render();
  } catch (e) {
    toast(`Não foi possível restaurar: ${e.message}`, { kind: 'error' });
  }
}

// ---------------- Instalar ----------------
function instalar() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return `
  ${standalone ? `<div class="banner banner-ok">${icon('check')}<p>O app já está instalado neste aparelho.</p></div>` : ''}
  ${ctx.installPrompt ? `<div class="row-btns"><button type="button" class="btn btn-primary btn-lg" data-act="install">${icon('phone')} Instalar agora</button></div>` : ''}
  <section class="card"><h2>iPhone (Safari)</h2>
    <ol class="steps">
      <li>Abra este endereço no <strong>Safari</strong>.</li>
      <li>Toque em <strong>Compartilhar</strong> (quadrado com seta para cima).</li>
      <li>Escolha <strong>Adicionar à Tela de Início</strong> e confirme.</li>
      <li>Abra pelo ícone novo e permita <strong>Localização</strong> e <strong>Notificações</strong> quando pedido.</li>
    </ol>
  </section>
  <section class="card"><h2>Android (Chrome)</h2>
    <ol class="steps">
      <li>Abra este endereço no <strong>Chrome</strong>.</li>
      <li>Toque no menu <strong>⋮</strong> → <strong>Instalar app</strong> (ou "Adicionar à tela inicial").</li>
      <li>Abra pelo ícone e permita localização e notificações.</li>
    </ol>
  </section>
  <section class="card"><h2>${icon('info')} Funciona offline</h2><p class="muted">Depois de aberto uma vez, o app funciona sem internet. Notícias e mapas precisam de conexão para atualizar.</p></section>`;
}
