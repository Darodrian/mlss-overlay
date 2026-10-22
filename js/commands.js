// Turning chat into overlay jobs: cleaning the text, deciding who is allowed
// to trigger a character and keeping the messages spaced out.
import { CHARACTER_LIST } from './characters.js';

const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const MENTION_RE = /[@#][\w-]+/g;
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu;

// Strips links, mentions and emoji, collapses the whitespace and caps the
// length so one chat message can never blow up the bubble.
export function sanitiseText(raw, maxLength = 120) {
  const cleaned = String(raw ?? '')
    .replace(URL_RE, ' ')
    .replace(MENTION_RE, ' ')
    .replace(EMOJI_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, Math.max(0, maxLength));
}

// The cooldown is tracked per user *and* character: saying "!mario" must not
// block "!luigi" from the same viewer, only repeating the same character.
export function cooldownKey(user, characterId) {
  const who = String(user ?? '').trim().toLowerCase();
  const who2 = String(characterId ?? '').trim().toLowerCase();
  return `${who}:${who2}`;
}

export function isAllowed(flags = {}, permissions = {}) {
  if (permissions.everyone) return true;
  if (flags.broadcaster && permissions.broadcaster) return true;
  if (flags.mod && permissions.mod) return true;
  if (flags.vip && permissions.vip) return true;
  if (flags.subscriber && permissions.subscriber) return true;
  return false;
}

export function parseCommand(rawText, { maxLength = 120, characters = CHARACTER_LIST } = {}) {
  const raw = String(rawText ?? '').trim();
  if (!raw) return { ok: false, reason: 'empty' };

  const space = raw.search(/\s/);
  const word = (space === -1 ? raw : raw.slice(0, space)).toLowerCase();
  const character = characters.find((c) => c.command === word) ?? null;
  if (!character) return { ok: false, reason: 'unknown-character' };

  const rest = space === -1 ? '' : raw.slice(space + 1);
  const message = sanitiseText(rest, maxLength);
  return { ok: true, character, message: message || character.defaultMessage };
}

// One message at a time on screen. The queue waits for the job to finish and
// then keeps a small gap so two messages never overlap.
export function createQueue({ minGapMs = 0, onJob = null, onIdle = null } = {}) {
  const pending = [];
  const cooldowns = new Map();

  let gapMs = Math.max(0, Number(minGapMs) || 0);
  let current = null;
  let timer = null;
  let running = false;
  let stopped = false;

  function snapshot() {
    const items = current ? [current, ...pending] : [...pending];
    return {
      playing: items.length > 0,
      pending: pending.length,
      items,
      current,
    };
  }

  function notifyIdle() {
    try {
      onIdle?.(snapshot());
    } catch (err) {
      console.error('[mlss] onIdle failed:', err);
    }
  }

  async function play(job) {
    running = true;
    try {
      await onJob?.(job);
    } catch (err) {
      console.error('[mlss] queued job failed:', err);
    }
    running = false;
    if (stopped) {
      current = null;
      return;
    }
    timer = setTimeout(next, gapMs);
  }

  function next() {
    timer = null;
    if (stopped) return;
    current = pending.shift() ?? null;
    if (!current) {
      notifyIdle();
      return;
    }
    play(current);
  }

  function enqueue(job) {
    if (stopped) return 0;
    pending.push(job);
    if (!current && !running && !timer) {
      current = pending.shift();
      play(current);
    }
    return pending.length;
  }

  function cooldownRemaining(user) {
    const until = cooldowns.get(user);
    if (!until) return 0;
    const left = until - Date.now();
    if (left <= 0) {
      cooldowns.delete(user);
      return 0;
    }
    return left;
  }

  function markUsed(user, ms) {
    cooldowns.set(user, Date.now() + Math.max(0, ms));
  }

  function stop() {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pending.length = 0;
    current = null;
    running = false;
  }

  function setMinGap(ms) {
    gapMs = Math.max(0, Number(ms) || 0);
  }

  return { enqueue, cooldownRemaining, markUsed, snapshot, stop, setMinGap };
}
