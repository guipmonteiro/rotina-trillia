// Gera um arquivo de calendário (.ics) com lembretes recorrentes de ponto.
// É a forma mais confiável de ter notificação diária no celular, mesmo com o app fechado.

import { pad } from './util.js';

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function stamp(d) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function fold(line) {
  // Linhas de no máximo 75 octetos (RFC 5545)
  const out = [];
  let s = line;
  while (s.length > 73) { out.push(s.slice(0, 73)); s = ' ' + s.slice(73); }
  out.push(s);
  return out.join('\r\n');
}

const escTxt = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

export function buildICS({ items, workDays, appUrl, alarmBefore = 0 }) {
  const now = new Date();
  // Primeira ocorrência: amanhã, para não disparar no passado
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const ymd = `${start.getFullYear()}${pad(start.getMonth() + 1)}${pad(start.getDate())}`;
  const days = workDays.slice().sort().map((d) => BYDAY[d]).join(',');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Rotina Trillia//Lembretes de ponto//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Lembretes de ponto',
    'X-WR-TIMEZONE:America/Sao_Paulo',
    'BEGIN:VTIMEZONE',
    'TZID:America/Sao_Paulo',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:-0300',
    'TZOFFSETTO:-0300',
    'TZNAME:-03',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];
  for (const it of items) {
    const [h, m] = it.time.split(':').map(Number);
    const t = `${pad(h)}${pad(m)}00`;
    const endM = h * 60 + m + 5;
    const tEnd = `${pad(Math.floor(endM / 60) % 24)}${pad(endM % 60)}00`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:ponto-${it.id}-${ymd}@rotina-trillia`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;TZID=America/Sao_Paulo:${ymd}T${t}`,
      `DTEND;TZID=America/Sao_Paulo:${ymd}T${tEnd}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${days}`,
      fold(`SUMMARY:⏰ ${escTxt(it.label)}`),
      fold(`DESCRIPTION:${escTxt(`Abra o app para registrar o ponto: ${appUrl}#bater`)}`),
      fold(`URL:${appUrl}#bater`),
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      fold(`DESCRIPTION:${escTxt(it.label)}`),
      `TRIGGER:-PT${alarmBefore}M`,
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
