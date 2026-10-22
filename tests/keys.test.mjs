import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normChannel,
  generateKey,
  validateKey,
  savedChannel,
  saveChannel,
  savedKey,
  saveKey,
  hasKey,
  overlayParams,
  adoptHashParams,
  overlayUrl,
} from '../js/keys.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('normChannel trims and lowercases', () => {
  assert.equal(normChannel('  MiCan  '), 'mican');
  assert.equal(normChannel(undefined), '');
});

test('generateKey returns the requested length from the unambiguous alphabet', () => {
  const key = generateKey();
  assert.equal(key.length, 24);
  assert.match(key, /^[23456789abcdefghjkmnpqrstuvwxyz]{24}$/);
});

test('generateKey never repeats the same value twice', () => {
  const keys = new Set(Array.from({ length: 50 }, () => generateKey()));
  assert.equal(keys.size, 50);
});

test('generateKey honours a custom length', () => {
  assert.equal(generateKey(8).length, 8);
});

test('validateKey rejects the wrong length and lookalike characters', () => {
  assert.equal(validateKey('a'.repeat(23)), false);
  assert.equal(validateKey('a'.repeat(25)), false);
  assert.equal(validateKey('o'.repeat(24)), false);
  assert.equal(validateKey('0'.repeat(24)), false);
  assert.equal(validateKey(''), false);
  assert.equal(validateKey(undefined), false);
  assert.equal(validateKey('a'.repeat(24)), true);
});

test('the channel round-trips through storage', () => {
  const storage = fakeStorage();
  saveChannel('  Darodrian ', storage);
  assert.equal(savedChannel(storage), 'darodrian');
});

test('keys are stored per channel', () => {
  const storage = fakeStorage();
  saveKey('mican', 'key-one', storage);
  saveKey('other', 'key-two', storage);
  assert.equal(savedKey('mican', storage), 'key-one');
  assert.equal(savedKey('other', storage), 'key-two');
  assert.equal(hasKey('mican', storage), true);
  assert.equal(hasKey('nobody', storage), false);
});

test('overlayParams reads the channel, key and mute flag from the hash', () => {
  assert.deepEqual(overlayParams('#c=MyCan&k=abc123&mute=1'), {
    channel: 'mycan',
    key: 'abc123',
    mute: true,
  });
  assert.deepEqual(overlayParams('#c=mycan&k=abc123'), {
    channel: 'mycan',
    key: 'abc123',
    mute: false,
  });
  assert.deepEqual(overlayParams(''), { channel: '', key: '', mute: false });
});

test('adoptHashParams stores the channel and key it is given', () => {
  const storage = fakeStorage();
  assert.equal(adoptHashParams('#c=MyCan&k=abc123', storage), true);
  assert.equal(savedChannel(storage), 'mycan');
  assert.equal(savedKey('mycan', storage), 'abc123');
});

test('adoptHashParams refuses an incomplete hash', () => {
  const storage = fakeStorage();
  assert.equal(adoptHashParams('#c=mycan', storage), false);
  assert.equal(adoptHashParams('#k=abc123', storage), false);
  assert.equal(savedChannel(storage), '');
});

test('overlayUrl carries the channel and the key', () => {
  const url = overlayUrl('MyCan', 'abc123');
  assert.match(url, /overlay\.html#c=mycan&k=abc123$/);
});

test('overlayUrl resolves against a base when one is given', () => {
  const url = overlayUrl('mycan', 'abc123', 'https://example.com/stream/index.html');
  assert.equal(url, 'https://example.com/stream/overlay.html#c=mycan&k=abc123');
});
