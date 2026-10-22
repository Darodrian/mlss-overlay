// Plays a character's voice line once, and wakes the audio context up so OBS
// lets the browser source make noise.
import { isMuted } from './mute.js';

export function createAudio({ volume = 1 } = {}) {
  const buffers = new Map();
  let ctx = null;
  let unlockTimer = null;
  let unlockAttempts = 0;

  function ensureContext() {
    if (ctx) return ctx;
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    return ctx;
  }

  async function load(url) {
    if (buffers.has(url)) return buffers.get(url);
    const pending = (async () => {
      const c = ensureContext();
      if (!c) return null;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`sound ${url} -> ${res.status}`);
      const buf = await c.decodeAudioData(await res.arrayBuffer());
      buffers.set(url, buf);
      return buf;
    })();
    buffers.set(url, pending);
    try {
      return await pending;
    } catch (err) {
      buffers.delete(url);
      throw err;
    }
  }

  async function durationMs(url) {
    const buf = await load(url);
    return buf ? Math.round(buf.duration * 1000) : 0;
  }

  // Plays the line once. The duration comes back even when muted so the
  // visuals keep the same timing.
  async function play(url) {
    const buf = await load(url);
    const ms = buf ? Math.round(buf.duration * 1000) : 0;
    if (!buf || isMuted()) return ms;

    const c = ensureContext();
    if (!c) return ms;
    if (c.state === 'suspended') await c.resume().catch(() => {});

    const source = c.createBufferSource();
    source.buffer = buf;
    const gain = c.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(c.destination);
    source.start();
    return ms;
  }

  // OBS blocks audio until the browser source is clicked, so keep nudging the
  // context until it wakes up.
  async function unlockAudio({ attempts = 40, intervalMs = 250 } = {}) {
    const c = ensureContext();
    if (!c) return 'unsupported';

    clearInterval(unlockTimer);
    unlockAttempts = attempts;

    const nudge = async () => {
      if (c.state === 'running') {
        clearInterval(unlockTimer);
        unlockTimer = null;
        return true;
      }
      if (unlockAttempts-- <= 0) {
        clearInterval(unlockTimer);
        unlockTimer = null;
        return false;
      }
      try {
        await c.resume();
      } catch {
        // the browser is still waiting for a gesture
      }
      return c.state === 'running';
    };

    const onGesture = () => {
      nudge();
    };
    window.addEventListener('pointerdown', onGesture, { passive: true });
    window.addEventListener('keydown', onGesture);

    if (await nudge()) return c.state;

    unlockTimer = setInterval(() => {
      if (nudge()) {
        window.removeEventListener('pointerdown', onGesture);
        window.removeEventListener('keydown', onGesture);
      }
    }, intervalMs);

    return c.state;
  }

  return {
    load,
    durationMs,
    play,
    unlockAudio,
    state: () => ctx?.state ?? 'none',
  };
}
