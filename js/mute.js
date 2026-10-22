// Shared mute flag between the overlay boot (URL fragment) and the dashboard's
// live toggle (postMessage). Playback consults it; the visuals keep running.
import { PREVIEW_MUTE_STORE } from './config.js';

let muted = false;

function resolveStorage(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function setMuted(v) {
  muted = Boolean(v);
  return muted;
}

export function isMuted() {
  return muted;
}

export function loadMute(storage) {
  const s = resolveStorage(storage);
  if (!s) return muted;
  try {
    muted = s.getItem(PREVIEW_MUTE_STORE) === '1';
  } catch {
    // private mode
  }
  return muted;
}

export function saveMute(storage) {
  const s = resolveStorage(storage);
  if (!s) return muted;
  try {
    s.setItem(PREVIEW_MUTE_STORE, muted ? '1' : '0');
  } catch {
    // private mode
  }
  return muted;
}
