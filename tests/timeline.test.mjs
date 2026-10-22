import test from 'node:test';
import assert from 'node:assert/strict';

import {
  walkDurationMs,
  typeDurationMs,
  walkDistancePx,
  buildSequence,
  sheetLoopMs,
  talkLoopCount,
  reactTiming,
} from '../js/timeline.js';
import { TIMINGS, LAYOUT, CHARACTERS } from '../js/characters.js';

const CHARACTER = {
  walkFrame: { w: 18, h: 36 },
  height: 36,
  talkFrames: 4,
  reactFrames: 4,
  reactLoops: 2,
  reactHoldMs: 0,
};
const TALK_LOOP_MS = 4 * TIMINGS.frameMs.talk;

test('a walk covers the distance from off-screen to the stand position', () => {
  // 1280 wide at scale 4 -> 320 source px wide stage.
  const distance = walkDistancePx({
    stageWidth: 1280,
    scale: LAYOUT.scale,
    characterWidth: 18,
    standFraction: LAYOUT.characterStandX,
    entranceSide: 'left',
  });
  // stand centre 44.8 source px, character half width 9, starts off-screen at -9
  assert.ok(Math.abs(distance - 53.8) < 0.001, `expected 53.8 source px, got ${distance}`);
});

test('a walk from the right covers the same distance as a walk from the left', () => {
  const args = { stageWidth: 1280, scale: 4, characterWidth: 18, standFraction: LAYOUT.characterStandX };
  const left = walkDistancePx({ ...args, entranceSide: 'left' });
  const right = walkDistancePx({ ...args, entranceSide: 'right' });
  assert.ok(Math.abs(left - right) < 0.001);
});

test('the walk duration follows the distance and the speed', () => {
  assert.equal(walkDurationMs(60, 60), 1000);
  assert.equal(walkDurationMs(30, 60), 500);
  assert.equal(walkDurationMs(0, 60), 0);
});

test('a wider stage means a longer walk at the same speed', () => {
  const narrow = walkDistancePx({ stageWidth: 1280, scale: 4, characterWidth: 18, standFraction: 0.14, entranceSide: 'left' });
  const wide = walkDistancePx({ stageWidth: 1920, scale: 4, characterWidth: 18, standFraction: 0.14, entranceSide: 'left' });
  assert.ok(wide > narrow);
});

test('the typewriter lasts at least as long as the sound', () => {
  const ms = typeDurationMs('hello', 877, TIMINGS);
  assert.ok(ms >= 877);
});

test('the typewriter gives a long message more time', () => {
  const short = typeDurationMs('hi', 0, TIMINGS);
  const long = typeDurationMs('hi '.repeat(40), 0, TIMINGS);
  assert.ok(long > short);
});

test('the typewriter never runs longer than the cap', () => {
  const ms = typeDurationMs('x'.repeat(5000), 0, TIMINGS);
  assert.ok(ms <= TIMINGS.maxTypeMs, `expected <= ${TIMINGS.maxTypeMs}, got ${ms}`);
});

test('an empty message takes no time to type', () => {
  assert.equal(typeDurationMs('', 877, TIMINGS), 0);
  assert.equal(typeDurationMs(null, 877, TIMINGS), 0);
});

test('the typewriter pace is the duration spread over the characters', () => {
  const ms = typeDurationMs('abcde', 0, TIMINGS);
  assert.equal(ms, 5 * TIMINGS.typeCharMs);
});

test('the sequence walks in, types, reacts and walks back out', () => {
  const seq = buildSequence({
    character: CHARACTER,
    message: 'hello',
    stageWidth: 1280,
    entranceSide: 'left',
    soundMs: 877,
  });
  assert.ok(seq.walkMs > 0);
  assert.ok(seq.typeMs >= 877);
  assert.equal(seq.reactMs, 2 * 4 * TIMINGS.frameMs.react);
  assert.equal(seq.exitMs, seq.walkMs);
  assert.equal(seq.totalMs, seq.walkMs + seq.talkMs + seq.reactMs + seq.exitMs);
});

test('the walk out is as long as the walk in', () => {
  const seq = buildSequence({
    character: CHARACTER,
    message: 'hello',
    stageWidth: 1280,
    entranceSide: 'left',
  });
  assert.equal(seq.exitMs, seq.walkMs);
});

test('a wider stage means a longer walk in the sequence', () => {
  const narrow = buildSequence({
    character: CHARACTER,
    message: 'hi',
    stageWidth: 1280,
    entranceSide: 'left',
  });
  const wide = buildSequence({
    character: CHARACTER,
    message: 'hi',
    stageWidth: 1920,
    entranceSide: 'left',
  });
  assert.ok(wide.walkMs > narrow.walkMs);
});

test('the sequence never types faster than the sound', () => {
  const seq = buildSequence({
    character: CHARACTER,
    message: 'hi',
    stageWidth: 1280,
    entranceSide: 'left',
    soundMs: 1344,
  });
  assert.ok(seq.typeMs >= 1344);
});

test('an empty message still gets a react beat', () => {
  const seq = buildSequence({
    character: CHARACTER,
    message: '',
    stageWidth: 1280,
    entranceSide: 'left',
  });
  assert.equal(seq.typeMs, 0);
  assert.equal(seq.reactMs, 2 * 4 * TIMINGS.frameMs.react);
  assert.ok(seq.totalMs > 0);
});

test('one loop of a sheet takes as long as its frames do', () => {
  assert.equal(sheetLoopMs(4, 110), 440);
  assert.equal(sheetLoopMs(1, 140), 140);
  assert.equal(sheetLoopMs(0, 140), 140, 'a sheet with no frames still counts as one');
});

test('the talk sheet loops at least the minimum number of times', () => {
  const count = talkLoopCount({ typeMs: 0, frames: 4, frameMs: 110, minLoops: 2 });
  assert.equal(count, 2);
});

test('the talk sheet loops more when the message is longer', () => {
  const short = talkLoopCount({ typeMs: 500, frames: 4, frameMs: 110, minLoops: 2 });
  const long = talkLoopCount({ typeMs: 3000, frames: 4, frameMs: 110, minLoops: 2 });
  assert.equal(short, 2);
  assert.ok(long > short, `expected more loops for a long message, got ${long}`);
});

test('the talk sheet always finishes on a whole cycle', () => {
  for (const typeMs of [0, 100, 440, 441, 900, 5000]) {
    const count = talkLoopCount({ typeMs, frames: 4, frameMs: 110, minLoops: 2 });
    assert.ok(count * TALK_LOOP_MS >= typeMs, `${count} loops do not cover ${typeMs}ms`);
    if (count > 2) {
      // The count only overshoots when the minimum forces it to.
      assert.ok((count - 1) * TALK_LOOP_MS < typeMs, `${count} loops overshoot ${typeMs}ms`);
    }
  }
});

test('the talk animation covers the whole typing time', () => {
  const seq = buildSequence({
    character: CHARACTER,
    message: 'hi',
    stageWidth: 1280,
    entranceSide: 'left',
    soundMs: 877,
  });
  assert.ok(seq.talkMs >= seq.typeMs, `talk ${seq.talkMs}ms is shorter than typing ${seq.typeMs}ms`);
  assert.equal(seq.talkMs, seq.talkLoops * TALK_LOOP_MS);
  assert.ok(seq.talkLoops >= 2);
});

test('a longer message makes the character talk for longer', () => {
  const args = { character: CHARACTER, stageWidth: 1280, entranceSide: 'left', soundMs: 0 };
  const short = buildSequence({ ...args, message: 'hi' });
  const long = buildSequence({ ...args, message: 'hi '.repeat(40) });
  assert.ok(long.talkLoops > short.talkLoops);
  assert.ok(long.talkMs > short.talkMs);
});

test('Mario thinks once and then holds the last frame', () => {
  const mario = CHARACTERS.mario;
  const react = reactTiming({ character: mario });
  assert.equal(react.reactLoops, 1);
  assert.equal(react.reactHoldMs, 400);
  assert.equal(react.reactMs, 1 * mario.reactFrames * TIMINGS.frameMs.react + 400);
});

test('Luigi nods twice', () => {
  const luigi = CHARACTERS.luigi;
  const react = reactTiming({ character: luigi });
  assert.equal(react.reactLoops, 2);
  assert.equal(react.reactHoldMs, 0);
  assert.equal(react.reactMs, 2 * luigi.reactFrames * TIMINGS.frameMs.react);
});

test('the reaction gesture is at least one loop long', () => {
  const react = reactTiming({ character: { reactFrames: 4, reactLoops: 0, reactHoldMs: 0 } });
  assert.equal(react.reactLoops, 1);
  assert.equal(react.reactMs, 4 * TIMINGS.frameMs.react);
});

test('the reaction falls back to the shared timing', () => {
  const react = reactTiming({ character: { reactFrames: 4 } });
  assert.equal(react.reactLoops, TIMINGS.reactLoops);
  assert.equal(react.reactHoldMs, TIMINGS.reactHoldMs);
});

test('the sequence uses the character own reaction timing', () => {
  const seq = buildSequence({
    character: CHARACTERS.mario,
    message: 'hello',
    stageWidth: 1280,
    entranceSide: 'left',
  });
  assert.equal(seq.reactLoops, 1);
  assert.equal(seq.reactHoldMs, 400);
  assert.equal(seq.reactMs, reactTiming({ character: CHARACTERS.mario }).reactMs);
  assert.equal(seq.totalMs, seq.walkMs + seq.talkMs + seq.reactMs + seq.exitMs);
});
