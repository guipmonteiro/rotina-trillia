// Geolocalização: posição atual, escritório mais próximo e busca de endereço.

import * as store from './store.js';
import { haversine } from './util.js';

export const supported = () => 'geolocation' in navigator;

export function getPosition({ timeout = 20000, maximumAge = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!supported()) {
      reject(Object.assign(new Error('Este navegador não oferece localização.'), { code: 'unsupported' }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        acc: pos.coords.accuracy,
        at: new Date(pos.timestamp || Date.now()).toISOString(),
      }),
      (err) => reject(Object.assign(new Error(errorText(err)), { code: err.code })),
      { enableHighAccuracy: true, timeout, maximumAge },
    );
  });
}

export function errorText(err) {
  switch (err?.code) {
    case 1: return 'Permissão de localização negada. Libere o acesso nas configurações do navegador para validar o presencial.';
    case 2: return 'Não foi possível determinar sua posição agora. Tente perto de uma janela ou com o Wi-Fi ligado.';
    case 3: return 'A localização demorou demais para responder. Tente de novo.';
    default: return err?.message || 'Falha ao obter localização.';
  }
}

/** Retorna todos os escritórios com distância, do mais próximo ao mais distante */
export function rankOffices(pos) {
  return store.get().offices
    .map((o) => {
      const dist = haversine(pos.lat, pos.lng, o.lat, o.lng);
      // Tolerância: soma até 50 m da imprecisão do GPS ao raio
      const tol = Math.min(pos.acc || 0, 50);
      return { office: o, dist, inside: dist <= o.radius + tol };
    })
    .sort((a, b) => a.dist - b.dist);
}

export function nearest(pos) {
  const r = rankOffices(pos);
  return r[0] || null;
}

/** Busca de endereço (OpenStreetMap / Nominatim) */
export async function searchAddress(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=br&accept-language=pt-BR&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Busca de endereço indisponível no momento.');
  const data = await res.json();
  return data.map((d) => ({ label: d.display_name, lat: Number(d.lat), lng: Number(d.lon) }));
}

export async function reverse(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=pt-BR&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return '';
    const d = await res.json();
    return d.display_name || '';
  } catch {
    return '';
  }
}

let watchId = null;
export function watch(cb) {
  if (!supported() || watchId != null) return;
  watchId = navigator.geolocation.watchPosition(
    (pos) => cb({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }),
    () => {},
    { enableHighAccuracy: true, maximumAge: 60000, timeout: 30000 },
  );
}
export function unwatch() {
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
}

export async function permissionState() {
  try {
    const p = await navigator.permissions.query({ name: 'geolocation' });
    return p.state; // granted | denied | prompt
  } catch {
    return 'unknown';
  }
}
