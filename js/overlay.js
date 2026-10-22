import { overlayParams, validateKey } from './keys.js';
import { DEFAULT_SETTINGS, liveCfgStore } from './config.js';
import { CHARACTER_LIST, LAYOUT, TIMINGS } from './characters.js';
import { SHEETS } from './sprites/index.js';
import { sanitiseText, isAllowed, parseCommand, createQueue, cooldownKey } from './commands.js';
import { characterCenterX, bubbleBox, tailCenterX } from './layout.js';
import { buildSequence } from './timeline.js';
import { createBridge } from './bridge.js';
import { startChat } from './chat.js';
import { createAudio } from './audio.js';
import { createBubble } from './bubble.js';
import { createSprite } from './sprite.js';
import { setMuted, loadMute } from './mute.js';

const PLACEHOLDER_CHANNEL = 'yourusername';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const spriteCanvas = $('sprite');

const sprite = createSprite(spriteCanvas);
const audio = createAudio();
const bubble = createBubble(stage);

// The bubble's text metrics live in LAYOUT, so the stylesheet takes them
// from there instead of repeating the numbers.
document.documentElement.style.setProperty('--font-size', `${LAYOUT.fontSize}px`);
document.documentElement.style.setProperty('--bubble-pad', `${LAYOUT.bubblePadding}px`);

let live = mergeSettings(null);
let bridge = null;
let generation = 0;
let jobSeq = 0;
let currentJob = null;

const queue = createQueue({ minGapMs: DEFAULT_SETTINGS.minGapMs, onJob });

const SETUP_REASONS = {
  'missing-key': {
    headline: 'This overlay needs its key',
    detail:
      'Open the dashboard, generate a key for your channel, then use Copy OBS URL. Every streamer has their own room.',
  },
  'missing-channel': {
    headline: 'This overlay needs its channel',
    detail: 'Use Copy OBS URL on the dashboard to get a link that already includes it.',
  },
  placeholder: {
    headline: 'Replace yourusername with your channel',
    detail: 'Use Copy OBS URL on the dashboard to get a link that already includes it.',
  },
  'invalid-key': {
    headline: "That key doesn't look valid",
    detail: 'Use Copy OBS URL on the dashboard to get a fresh link.',
  },
};

function showSetup(reason) {
  const copy = SETUP_REASONS[reason] ?? SETUP_REASONS['invalid-key'];
  $('setup-headline').textContent = copy.headline;
  $('setup-detail').textContent = copy.detail;
  $('setup').classList.add('show');
  document.title = `Mario & Luigi Overlay - ${reason}`;
}

function num(v, def) {
  return Number.isFinite(Number(v)) ? Number(v) : def;
}

// Merge por clave de primer nivel sobre DEFAULT_SETTINGS; permissions en
// particular; las claves desconocidas se descartan.
function mergeSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const permSrc = src.permissions && typeof src.permissions === 'object' ? src.permissions : {};
  const permissions = {};
  for (const k of Object.keys(DEFAULT_SETTINGS.permissions)) {
    permissions[k] = Boolean(permSrc[k]);
  }
  return {
    entranceSide: src.entranceSide === 'right' ? 'right' : 'left',
    permissions,
    userCooldownMs: num(src.userCooldownMs, DEFAULT_SETTINGS.userCooldownMs),
    minGapMs: num(src.minGapMs, DEFAULT_SETTINGS.minGapMs),
    maxLength: num(src.maxLength, DEFAULT_SETTINGS.maxLength),
  };
}

function readCachedSettings(channelName) {
  try {
    return JSON.parse(localStorage.getItem(liveCfgStore(channelName)) || 'null');
  } catch {
    return null;
  }
}

function cacheSettings(channelName, settings) {
  try {
    localStorage.setItem(liveCfgStore(channelName), JSON.stringify(settings));
  } catch {
    // modo privado
  }
}

// ---- arranque ----

const { channel, key, mute } = overlayParams(location.hash);
if (mute) setMuted(true);
else loadMute();

if (!key) showSetup('missing-key');
else if (!channel) showSetup('missing-channel');
else if (channel === PLACEHOLDER_CHANNEL) showSetup('placeholder');
else if (!validateKey(key)) showSetup('invalid-key');
else boot(channel, key);

async function boot(channelName, roomKey) {
  live = mergeSettings(readCachedSettings(channelName));
  queue.setMinGap(live.minGapMs);

  try {
    await document.fonts.load(`${LAYOUT.fontSize}px Zpix`);
    await document.fonts.ready;
  } catch {
    console.warn('[overlay] could not load the Zpix font');
  }

  await audio.unlockAudio();
  connectRoom(roomKey); // sin await: el chat nunca espera a la sala
  startChat({ channel: channelName, onCommand: handleChatCommand });

  setInterval(reportState, 4000);
}

// ---- sala realtime ----

async function connectRoom(roomKey) {
  try {
    const b = createBridge(roomKey);
    b.onSet(({ settings }) => {
      live = mergeSettings(settings);
      queue.setMinGap(live.minGapMs);
      cacheSettings(channel, live);
      console.log('[overlay] settings updated from dashboard');
    });
    b.onSay((payload = {}) => {
      const character =
        CHARACTER_LIST.find((c) => c.id === payload.character) ?? CHARACTER_LIST[0];
      const message = sanitiseText(payload.text, live.maxLength) || character.defaultMessage;
      enqueue({
        user: payload.user ?? 'control',
        character,
        message,
        flags: payload.flags ?? { broadcaster: true },
      });
    });
    await b.connect();
    bridge = b;
    b.sendHello({ at: Date.now() });
    reportState();
    console.log('[overlay] room connected');
  } catch (err) {
    bridge = null;
    console.warn('[overlay] room unavailable, continuing without it', err?.message ?? err);
  }
}

function reportState() {
  if (!bridge?.isConnected()) return;
  bridge.sendState({ at: Date.now(), audio: audio.state(), queue: queue.snapshot() });
}

// ---- comandos ----

function handleChatCommand({ user, command, text, flags }) {
  if (!isAllowed(flags, live.permissions)) {
    console.log(`[overlay] ${user} is not allowed to trigger a character`);
    return false;
  }
  const parsed = parseCommand(`${command} ${text}`.trim(), { maxLength: live.maxLength });
  if (!parsed.ok) {
    console.log(`[overlay] command rejected: ${parsed.reason}`);
    return false;
  }
  return enqueue({ user, character: parsed.character, message: parsed.message, flags });
}

function enqueue({ user, character, message, flags }) {
  const userKey = String(user ?? '').toLowerCase();
  // The cooldown is per user and character, so a viewer can use one character
  // and then the other without waiting.
  const coolKey = cooldownKey(userKey, character.id);
  if (userKey !== 'control') {
    const remaining = queue.cooldownRemaining(coolKey);
    if (remaining > 0) {
      console.log(`[overlay] ${userKey} on cooldown for ${character.id} (${Math.ceil(remaining / 1000)}s)`);
      return false;
    }
  }

  queue.markUsed(coolKey, live.userCooldownMs);
  queue.enqueue({
    id: `${Date.now()}-${(jobSeq += 1)}`,
    user: userKey,
    character,
    message,
    flags,
    at: Date.now(),
  });
  return true;
}

// ---- la escena ----

function soundUrl(character) {
  return new URL(character.sound, document.baseURI).href;
}

function maxBubbleWidth() {
  return Math.min(stage.clientWidth * LAYOUT.maxBubbleWidthFrac, LAYOUT.maxBubbleWidthPx);
}

// Dibuja los frames de una hoja y mueve al personaje mientras tanto.
// Con "loops" la hoja se reproduce ese número de veces y luego se queda en el
// último frame; sin él, repite hasta que se acaba el tiempo.
function runSheet(mine, sheet, durationMs, frameMs, onFrame, loops = null) {
  return new Promise((resolve) => {
    const start = performance.now();
    const frames = sheet.frames.length;
    const lastIndex = loops ? loops * frames - 1 : Infinity;
    let lastIndexDrawn = -1;
    const step = (now) => {
      if (mine !== generation) {
        resolve(false);
        return;
      }
      const elapsed = now - start;
      const index = Math.min(Math.floor(elapsed / frameMs), lastIndex) % frames;
      if (index !== lastIndexDrawn) {
        sprite.draw(index);
        lastIndexDrawn = index;
      }
      onFrame?.(Math.min(1, durationMs > 0 ? elapsed / durationMs : 1));
      if (elapsed >= durationMs) {
        resolve(true);
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function placeCharacter(centerX) {
  spriteCanvas.style.left = `${Math.round(centerX - sprite.width / 2)}px`;
}

function positionBubble(character, entranceSide) {
  const stageWidth = stage.clientWidth;
  const stageHeight = stage.clientHeight;
  const charX = characterCenterX(stageWidth, entranceSide);
  const box = bubbleBox({
    stageWidth,
    stageHeight,
    characterX: charX,
    characterHeight: character.height * LAYOUT.scale,
    bubbleWidth: bubble.width,
    bubbleHeight: bubble.height,
    entranceSide,
  });
  bubble.setPosition(box);
  const tailX = tailCenterX({
    characterX: charX,
    bubbleLeft: box.left,
    bubbleWidth: box.width,
    entranceSide,
  });
  bubble.setTail(tailX - box.left);
}

function typewrite(mine, message, durationMs) {
  const chars = Array.from(message);
  if (!chars.length) return Promise.resolve();

  const perChar = Math.max(16, durationMs / chars.length);
  bubble.setText(chars[0]);
  let i = 1;

  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (mine !== generation) {
        clearInterval(timer);
        resolve();
        return;
      }
      bubble.setText(chars.slice(0, i).join(''));
      i += 1;
      if (i > chars.length) {
        clearInterval(timer);
        resolve();
      }
    }, perChar);
  });
}

async function onJob(job) {
  const mine = ++generation;
  currentJob = job;
  const character = job.character;
  const entranceSide = live.entranceSide;
  const stageWidth = stage.clientWidth;

  try {
    const sheets = Object.values(character.animations).map((name) => SHEETS[name]);
    await sprite.load(sheets);
    if (mine !== generation) return;

    const url = soundUrl(character);
    const soundMs = await audio.durationMs(url);
    if (mine !== generation) return;

    const seq = buildSequence({
      character,
      message: job.message,
      stageWidth,
      entranceSide,
      soundMs,
    });

    // ---- entrar ----
    // The walk sheets are drawn facing right, so an entrance from the right is
    // the mirrored one and an entrance from the left is not.
    sprite.setMirror(entranceSide === 'right');
    sprite.use(SHEETS[character.animations.enter]);
    const standX = characterCenterX(stageWidth, entranceSide);
    const half = sprite.width / 2;
    const offX = entranceSide === 'right' ? stageWidth + half : -half;
    await runSheet(mine, SHEETS[character.animations.enter], seq.walkMs, TIMINGS.frameMs.walk, (t) => {
      placeCharacter(offX + (standX - offX) * t);
    });
    if (mine !== generation) return;

    // ---- hablar ----
    sprite.use(SHEETS[character.animations.talk]);
    placeCharacter(standX);
    bubble.setMessage(job.message, maxBubbleWidth());
    positionBubble(character, entranceSide);
    bubble.show();

    const typing = typewrite(mine, job.message, seq.typeMs);
    const talking = runSheet(
      mine,
      SHEETS[character.animations.talk],
      seq.talkMs,
      TIMINGS.frameMs.talk,
    );
    audio.play(url).catch((err) => console.error('[overlay] sound failed', err));
    await Promise.all([typing, talking]);
    if (mine !== generation) return;

    // ---- reaccionar ----
    sprite.use(SHEETS[character.animations.react]);
    await runSheet(
      mine,
      SHEETS[character.animations.react],
      seq.reactMs,
      TIMINGS.frameMs.react,
      null,
      seq.reactLoops,
    );
    if (mine !== generation) return;

    // ---- salir ----
    bubble.hide();
    sprite.setMirror(entranceSide === 'left');
    sprite.use(SHEETS[character.animations.exit]);
    await runSheet(mine, SHEETS[character.animations.exit], seq.exitMs, TIMINGS.frameMs.walk, (t) => {
      placeCharacter(standX + (offX - standX) * t);
    });
  } catch (err) {
    console.error('[overlay] job failed', err);
  } finally {
    if (mine === generation) {
      bubble.hide();
      currentJob = null;
    }
  }
}

window.addEventListener('resize', () => {
  if (!currentJob) return;
  positionBubble(currentJob.character, live.entranceSide);
});

// El panel de control alterna el mute en vivo y puede probar el overlay sin
// pasar por la sala.
window.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'preview-mute') {
    setMuted(data.muted);
    return;
  }
  if (data.type === 'mlss-say') {
    const character =
      CHARACTER_LIST.find((c) => c.id === data.character) ?? CHARACTER_LIST[0];
    const message = sanitiseText(data.text, live.maxLength) || character.defaultMessage;
    enqueue({ user: 'control', character, message, flags: { broadcaster: true } });
  }
});

Object.assign(window, {
  mlss: {
    say: (characterId, text) => {
      const character = CHARACTER_LIST.find((c) => c.id === characterId) ?? CHARACTER_LIST[0];
      const message = sanitiseText(text, live.maxLength) || character.defaultMessage;
      return enqueue({ user: 'control', character, message, flags: { broadcaster: true } });
    },
    state: () => ({ audio: audio.state(), queue: queue.snapshot() }),
  },
});
