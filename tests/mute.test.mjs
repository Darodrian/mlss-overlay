import test from 'node:test';
import assert from 'node:assert/strict';

import { setMuted, isMuted, loadMute, saveMute } from '../js/mute.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('the mute flag starts off', () => {
  setMuted(false);
  assert.equal(isMuted(), false);
});

test('the mute flag turns on and off', () => {
  setMuted(true);
  assert.equal(isMuted(), true);
  setMuted(false);
  assert.equal(isMuted(), false);
});

test('anything truthy mutes', () => {
  setMuted('yes');
  assert.equal(isMuted(), true);
  setMuted(0);
  assert.equal(isMuted(), false);
});

test('the mute flag survives a reload', () => {
  const storage = fakeStorage();
  setMuted(true);
  saveMute(storage);
  setMuted(false);
  assert.equal(loadMute(storage), true);
  assert.equal(isMuted(), true);
});

test('a stored zero means not muted', () => {
  const storage = fakeStorage({ mlss_preview_muted: '0' });
  setMuted(true);
  assert.equal(loadMute(storage), false);
  assert.equal(isMuted(), false);
});

test('loading with no storage leaves the flag alone', () => {
  setMuted(true);
  loadMute(null);
  assert.equal(isMuted(), true);
});
