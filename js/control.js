// The dashboard: it owns the channel, the key and the settings, keeps a realtime
// room open for the overlay and shows a live preview of what OBS will display.
import {
  savedChannel,
  saveChannel,
  savedKey,
  saveKey,
  hasKey,
  generateKey,
  adoptHashParams,
  overlayUrl,
} from './keys.js';
import {
  DEFAULT_SETTINGS,
  ENTRANCE_SIDES,
  cfgStore,
  liveCfgStore,
  PREVIEW_MUTE_STORE,
} from './config.js';
import { CHARACTER_LIST } from './characters.js';
import { createBridge } from './bridge.js';

const $ = (id) => document.getElementById(id);

const STATE_TTL = 12_000;

const good = (t) => `<span class="good">${t}</span>`;
const bad = (t) => `<span class="bad">${t}</span>`;

let channel = savedChannel();
let key = '';
let config = null;
let bridge = null;
let roomGen = 0;
let lastStateAt = 0;
let flashTimer = null;
let sayCharacter = CHARACTER_LIST[0]?.id ?? 'mario';

// The key can arrive in the hash when the dashboard is opened from the copied
// URL. It is adopted once and then the hash is cleaned up.
if (adoptHashParams(location.hash)) {
  history.replaceState(null, '', location.pathname + location.search);
  channel = savedChannel();
}
key = savedKey(channel);

// ---- small helpers ----

function setDot(kind, text) {
  $('dot-room').className = 'dot' + (kind ? ' ' + kind : '');
  $('status-room').textContent = text;
}

function flash(text) {
  const msg = $('msg');
  msg.textContent = text;
  msg.hidden = false;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    msg.hidden = true;
    msg.textContent = '';
  }, 5000);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch {
      // no clipboard
    }
    ta.remove();
  }
}

function previewMuted() {
  try {
    return localStorage.getItem(PREVIEW_MUTE_STORE) === '1';
  } catch {
    return false;
  }
}

function persistPreviewMuted(v) {
  try {
    localStorage.setItem(PREVIEW_MUTE_STORE, v ? '1' : '0');
  } catch {
    // private mode
  }
}

// ---- settings ----

function loadSettings() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(cfgStore(channel)) || 'null');
  } catch {
    raw = null;
  }
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    ...DEFAULT_SETTINGS,
    ...src,
    entranceSide: ENTRANCE_SIDES.includes(src.entranceSide) ? src.entranceSide : 'left',
    permissions: { ...DEFAULT_SETTINGS.permissions, ...(src.permissions ?? {}) },
  };
}

// The dashboard keeps the overlay's boot cache in sync so a freshly opened
// browser source starts with the same settings.
function persistSettings() {
  const payload = JSON.stringify(config);
  try {
    localStorage.setItem(cfgStore(channel), payload);
    localStorage.setItem(liveCfgStore(channel), payload);
  } catch {
    // private mode
  }
}

function broadcastSettings() {
  if (bridge?.isConnected()) bridge.sendSet({ settings: config });
}

const num = (el) => {
  if (el.value.trim() === '') return null;
  const n = Number(el.value);
  return Number.isFinite(n) ? n : null;
};

const clampInt = (n, lo, hi) => Math.min(hi, Math.max(lo, Math.round(n)));

function permissionSummary() {
  const p = config.permissions;
  if (p.everyone) return 'Everyone';
  const names = [
    ['broadcaster', 'the broadcaster'],
    ['mod', 'mods'],
    ['vip', 'VIPs'],
    ['subscriber', 'subscribers'],
  ];
  const on = names.filter(([k]) => p[k]).map(([, label]) => label);
  return on.length ? on.join(', ') : 'Nobody';
}

function renderConfig() {
  $('cCooldown').textContent = `${Math.round(config.userCooldownMs / 1000)}s`;
  $('cMaxLen').textContent = `${config.maxLength} chars`;
  $('cPerms').textContent = permissionSummary();

  for (const box of document.querySelectorAll('[data-perm]')) {
    box.checked = Boolean(config.permissions[box.dataset.perm]);
  }
  $('vCooldown').value = Math.round(config.userCooldownMs / 1000);
  $('vMaxLen').value = config.maxLength;

  for (const btn of document.querySelectorAll('#entrance .segbtn')) {
    btn.classList.toggle('on', btn.dataset.side === config.entranceSide);
  }
  $('stage-mini').className = 'stage-mini is-' + config.entranceSide;
}

function showKey() {
  const has = !!key;
  $('keyval').textContent = key;
  $('keyval').hidden = !has;
  $('keynone').hidden = has;
  $('btn-copy').disabled = !has || !channel;
  $('btn-key').textContent = has ? 'Change key' : 'Generate key';
}

// ---- the preview ----

function previewUrl() {
  const base = overlayUrl(channel, key);
  return previewMuted() ? `${base}&mute=1` : base;
}

function syncPreviewMute() {
  $('preview').contentWindow?.postMessage(
    { type: 'preview-mute', muted: $('previewMute').checked },
    '*',
  );
}

function updatePreview() {
  if (channel && key) {
    $('preview').src = previewUrl();
    $('preview').hidden = false;
    $('preview-hint').hidden = false;
  } else {
    $('preview').hidden = true;
    $('preview-hint').hidden = true;
  }
}

$('previewMute').checked = previewMuted();
$('previewMute').addEventListener('change', () => {
  persistPreviewMuted($('previewMute').checked);
  syncPreviewMute();
});
$('preview').addEventListener('load', syncPreviewMute);

// ---- the room ----

async function startRoom() {
  const gen = ++roomGen;
  if (bridge) {
    await bridge.leave();
    bridge = null;
  }
  lastStateAt = 0;
  if (gen !== roomGen) return;
  if (!channel || !key) {
    setDot('', 'No room yet');
    return;
  }

  setDot('busy', 'Connecting...');
  try {
    const b = createBridge(key);
    b.onStatus((s) => {
      if (s === 'CHANNEL_ERROR') setDot('err', 'Key rejected');
      else if (s === 'CLOSED') setDot('', 'Room closed');
    });
    b.onHello(() => {
      lastStateAt = Date.now();
      setDot('live', 'Overlay connected');
      // Confirm the saved settings in case the overlay just opened.
      b.sendSet({ settings: config });
    });
    b.onState((payload) => renderState(payload));
    await b.connect();
    if (gen !== roomGen) {
      await b.leave();
      return;
    }
    bridge = b;
    b.sendSet({ settings: config });
    setDot('busy', 'Waiting for the overlay...');
  } catch (err) {
    if (gen !== roomGen) return;
    const m = err?.message ?? '';
    setDot(
      'err',
      m === 'CHANNEL_ERROR'
        ? 'Key rejected'
        : m === 'TIMED_OUT'
          ? 'No response'
          : 'Could not connect to the room',
    );
  }
}

function renderState(payload) {
  lastStateAt = Date.now();
  setDot('live', 'Overlay connected');

  const audio = payload.audio ?? 'unknown';
  if (audio === 'running') $('preview-hint').hidden = true;
  $('cSay').disabled = !bridge?.isConnected();
}

setInterval(() => {
  if (bridge?.isConnected() && lastStateAt && Date.now() - lastStateAt > STATE_TTL) {
    setDot('', 'Overlay not connected');
  }
}, 5000);

// ---- channel and key ----

$('channel').addEventListener('change', () => {
  saveChannel($('channel').value);
  channel = savedChannel();
  key = savedKey(channel);
  config = loadSettings();
  showKey();
  renderConfig();
  startRoom();
  updatePreview();
});

$('btn-key').addEventListener('click', async () => {
  if (!channel) {
    flash('Type your channel first');
    return;
  }
  const had = hasKey(channel);
  const msg = had
    ? 'A new key will be generated.\n\nYour overlay will stop syncing until you paste the new URL into OBS (Browser Source > URL). You will have to copy it again.'
    : 'A key will be generated for your overlay.\n\nThen copy it with "Copy OBS URL" and paste it into the OBS browser source.';
  if (!confirm(msg)) return;
  key = generateKey();
  saveKey(channel, key);
  showKey();
  await startRoom();
  updatePreview();
  await copyText(overlayUrl(channel, key));
  flash(
    had
      ? 'New key generated and URL copied. Update the URL in OBS.'
      : 'Key generated and URL copied. Paste it into the OBS browser source.',
  );
});

$('btn-copy').addEventListener('click', async () => {
  await copyText(overlayUrl(channel, key));
  flash('OBS URL copied');
});

// ---- the view ----

for (const btn of document.querySelectorAll('#entrance .segbtn')) {
  btn.addEventListener('click', () => {
    if (!channel) {
      flash('Type your channel first');
      return;
    }
    const side = btn.dataset.side;
    if (!ENTRANCE_SIDES.includes(side) || side === config.entranceSide) return;
    config.entranceSide = side;
    persistSettings();
    renderConfig();
    broadcastSettings();
    flash('Entrance side saved. Running overlays pick it up without a reload.');
  });
}

// ---- permissions ----

$('save').addEventListener('click', () => {
  const note = $('saveNote');
  if (!channel) {
    note.innerHTML = bad('set your channel first');
    return;
  }

  const permissions = {};
  for (const box of document.querySelectorAll('[data-perm]')) {
    permissions[box.dataset.perm] = box.checked;
  }

  config = {
    ...config,
    permissions,
    userCooldownMs: (num($('vCooldown')) ?? DEFAULT_SETTINGS.userCooldownMs / 1000) * 1000,
    maxLength: clampInt(
      num($('vMaxLen')) ?? DEFAULT_SETTINGS.maxLength,
      1,
      500,
    ),
  };

  persistSettings();
  renderConfig();
  broadcastSettings();
  note.innerHTML = good('Saved. Running overlays pick this up without a reload.');
});

// ---- say something ----

$('sayCharacter').innerHTML = CHARACTER_LIST.map(
  (c, i) =>
    `<button type="button" class="segbtn ${c.id}${i === 0 ? ' on' : ''}" data-char="${c.id}">${c.name}</button>`,
).join('');

for (const btn of document.querySelectorAll('#sayCharacter .segbtn')) {
  btn.addEventListener('click', () => {
    sayCharacter = btn.dataset.char;
    for (const other of document.querySelectorAll('#sayCharacter .segbtn')) {
      other.classList.toggle('on', other === btn);
    }
  });
}

$('cSay').addEventListener('click', () => {
  const note = $('sayNote');
  if (!bridge?.isConnected()) {
    note.innerHTML = bad('the overlay is not connected to the room');
    return;
  }
  bridge.sendSay({ character: sayCharacter, text: $('cMessage').value });
  note.innerHTML = good('sent — watch your overlay');
});

$('cSayPreview').addEventListener('click', () => {
  const note = $('sayNote');
  const win = $('preview').contentWindow;
  if (!win || $('preview').hidden) {
    note.innerHTML = bad('there is no preview to send to yet');
    return;
  }
  win.postMessage(
    { type: 'mlss-say', character: sayCharacter, text: $('cMessage').value },
    '*',
  );
  note.innerHTML = good('sent to the preview only');
});

// ---- start ----

$('channel').value = channel;
config = loadSettings();
showKey();
renderConfig();
updatePreview();
startRoom();
