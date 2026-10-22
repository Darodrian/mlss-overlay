import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CHARACTERS, CHARACTER_LIST, LAYOUT, TIMINGS } from '../js/characters.js';
import { SHEETS } from '../js/sprites/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('there are two characters and they answer to different commands', () => {
  assert.equal(CHARACTER_LIST.length, 2);
  const commands = CHARACTER_LIST.map((c) => c.command);
  assert.equal(new Set(commands).size, commands.length);
  for (const command of commands) assert.match(command, /^[a-z]+$/);
});

test('every animation a character uses exists as a generated sheet', () => {
  for (const character of CHARACTER_LIST) {
    for (const [role, sheetName] of Object.entries(character.animations)) {
      assert.ok(SHEETS[sheetName], `${character.id}.${role} points at unknown sheet "${sheetName}"`);
    }
  }
});

test('every sheet used by a character actually has frames', () => {
  for (const character of CHARACTER_LIST) {
    for (const sheetName of Object.values(character.animations)) {
      assert.ok(SHEETS[sheetName].frames.length > 0, `sheet "${sheetName}" has no frames`);
    }
  }
});

test('every character has a sound file on disk', () => {
  for (const character of CHARACTER_LIST) {
    assert.ok(fs.existsSync(path.join(ROOT, character.sound)), `missing sound file ${character.sound}`);
  }
});

test('a character walks in and out with the same animation', () => {
  for (const character of CHARACTER_LIST) {
    assert.equal(character.animations.enter, character.animations.exit);
  }
});

test('a character has a reaction animation that is not its talk animation', () => {
  for (const character of CHARACTER_LIST) {
    assert.notEqual(character.animations.react, character.animations.talk);
  }
});

test('the layout constants describe a coherent picture', () => {
  assert.equal(LAYOUT.scale, 4);
  assert.equal(LAYOUT.tile, 8 * LAYOUT.scale);
  assert.equal(LAYOUT.pointer, 16 * LAYOUT.scale);
  assert.ok(LAYOUT.characterStandX > 0 && LAYOUT.characterStandX < 0.5);
  assert.ok(LAYOUT.bubbleDiagX > 0 && LAYOUT.bubbleDiagX < 0.5);
  assert.ok(LAYOUT.bubbleGapY >= 0);
});

test('the timings are positive and the typewriter cannot run forever', () => {
  assert.ok(TIMINGS.walkSpeedPxPerSec > 0);
  assert.ok(TIMINGS.frameMs.walk > 0);
  assert.ok(TIMINGS.frameMs.talk > 0);
  assert.ok(TIMINGS.frameMs.react > 0);
  assert.ok(TIMINGS.typeCharMs > 0);
  assert.ok(TIMINGS.maxTypeMs > TIMINGS.typeCharMs);
});

test('CHARACTERS is keyed by id', () => {
  for (const character of CHARACTER_LIST) {
    assert.equal(CHARACTERS[character.id], character);
  }
});

test('a character reports the frame size of its walk sheet', () => {
  for (const character of CHARACTER_LIST) {
    const sheet = SHEETS[character.animations.enter];
    assert.deepEqual(character.walkFrame, { w: sheet.frames[0].w, h: sheet.frames[0].h });
  }
});

test('the character height is the tallest animation it plays', () => {
  for (const character of CHARACTER_LIST) {
    const tallest = Math.max(
      ...Object.values(character.animations).map((n) => SHEETS[n].frames[0].h),
    );
    assert.equal(character.height, tallest);
  }
});

test('the character height is what the overlay draws at full scale', () => {
  for (const character of CHARACTER_LIST) {
    assert.equal(character.height * LAYOUT.scale, character.height * 4);
  }
});

test('a character reports how many frames its talk and reaction sheets have', () => {
  for (const character of CHARACTER_LIST) {
    assert.equal(character.talkFrames, SHEETS[character.animations.talk].frames.length);
    assert.equal(character.reactFrames, SHEETS[character.animations.react].frames.length);
    assert.ok(character.talkFrames > 1, `${character.id} needs more than one talk frame`);
    assert.ok(character.reactFrames > 1, `${character.id} needs more than one reaction frame`);
  }
});

test('every character picks how often its reaction gesture plays', () => {
  for (const character of CHARACTER_LIST) {
    assert.ok(Number.isInteger(character.reactLoops), `${character.id} needs whole loops`);
    assert.ok(character.reactLoops >= 1, `${character.id} must react at least once`);
    assert.ok(character.reactHoldMs >= 0, `${character.id} cannot hold for negative time`);
  }
});
