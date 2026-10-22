import test from 'node:test';
import assert from 'node:assert/strict';

import { characterCenterX, bubbleBox, tailCenterX } from '../js/layout.js';
import { LAYOUT } from '../js/characters.js';

const STAGE_W = 1280;
const STAGE_H = 720;
const CHAR_H = 144; // 36 source px at scale 4

test('the character stands a fixed fraction from the entrance edge', () => {
  assert.equal(characterCenterX(STAGE_W, 'left'), STAGE_W * LAYOUT.characterStandX);
  assert.equal(characterCenterX(STAGE_W, 'right'), STAGE_W * (1 - LAYOUT.characterStandX));
});

test('the character stands closer to the edge than to the middle', () => {
  assert.ok(characterCenterX(STAGE_W, 'left') < STAGE_W * 0.25);
  assert.ok(characterCenterX(STAGE_W, 'right') > STAGE_W * 0.75);
});

test('the bubble sits a gap above the character head', () => {
  const characterX = characterCenterX(STAGE_W, 'left');
  const box = bubbleBox({
    stageWidth: STAGE_W,
    stageHeight: STAGE_H,
    characterX,
    characterHeight: CHAR_H,
    bubbleWidth: 400,
    bubbleHeight: 100,
    entranceSide: 'left',
  });
  const headTop = STAGE_H - CHAR_H;
  assert.equal(box.bottom, headTop - LAYOUT.bubbleGapY);
  assert.equal(box.top, box.bottom - 100);
});

test('the bubble sits away from the entrance edge', () => {
  const left = bubbleBox({
    stageWidth: STAGE_W,
    stageHeight: STAGE_H,
    characterX: characterCenterX(STAGE_W, 'left'),
    characterHeight: CHAR_H,
    bubbleWidth: 400,
    bubbleHeight: 100,
    entranceSide: 'left',
  });
  const right = bubbleBox({
    stageWidth: STAGE_W,
    stageHeight: STAGE_H,
    characterX: characterCenterX(STAGE_W, 'right'),
    characterHeight: CHAR_H,
    bubbleWidth: 400,
    bubbleHeight: 100,
    entranceSide: 'right',
  });
  assert.ok(left.left + 400 / 2 > characterCenterX(STAGE_W, 'left'), 'bubble should lean right of a left-entering character');
  assert.ok(right.left + 400 / 2 < characterCenterX(STAGE_W, 'right'), 'bubble should lean left of a right-entering character');
});

test('the bubble never leaves the stage', () => {
  const box = bubbleBox({
    stageWidth: STAGE_W,
    stageHeight: STAGE_H,
    characterX: characterCenterX(STAGE_W, 'left'),
    characterHeight: CHAR_H,
    bubbleWidth: 1200,
    bubbleHeight: 100,
    entranceSide: 'left',
  });
  assert.equal(box.left, 0);
  assert.ok(box.left + box.width <= STAGE_W, 'the bubble must not spill past the right edge');
});

test('a bubble wider than the stage is pinned to the left edge', () => {
  const box = bubbleBox({
    stageWidth: STAGE_W,
    stageHeight: STAGE_H,
    characterX: characterCenterX(STAGE_W, 'left'),
    characterHeight: CHAR_H,
    bubbleWidth: 2000,
    bubbleHeight: 100,
    entranceSide: 'left',
  });
  assert.equal(box.left, 0);
});

test('the tail leans toward the side the character came from', () => {
  const characterX = characterCenterX(STAGE_W, 'left');
  const box = bubbleBox({
    stageWidth: STAGE_W,
    stageHeight: STAGE_H,
    characterX,
    characterHeight: CHAR_H,
    bubbleWidth: 400,
    bubbleHeight: 100,
    entranceSide: 'left',
  });
  const tail = tailCenterX({
    characterX,
    bubbleLeft: box.left,
    bubbleWidth: box.width,
    entranceSide: 'left',
    pointerWidth: LAYOUT.pointer,
    lean: LAYOUT.tailLean,
  });
  assert.ok(tail < characterX, 'the tail should sit left of the character');
  assert.ok(tail > box.left, 'the tail must stay on the bubble');
});

test('a right-entering character gets the tail on the other side', () => {
  const characterX = characterCenterX(STAGE_W, 'right');
  const box = bubbleBox({
    stageWidth: STAGE_W,
    stageHeight: STAGE_H,
    characterX,
    characterHeight: CHAR_H,
    bubbleWidth: 400,
    bubbleHeight: 100,
    entranceSide: 'right',
  });
  const tail = tailCenterX({
    characterX,
    bubbleLeft: box.left,
    bubbleWidth: box.width,
    entranceSide: 'right',
    pointerWidth: LAYOUT.pointer,
    lean: LAYOUT.tailLean,
  });
  assert.ok(tail > characterX, 'the tail should sit right of the character');
  assert.ok(tail < box.left + box.width, 'the tail must stay on the bubble');
});

test('the tail stays on the bubble even when the character is far outside it', () => {
  const tail = tailCenterX({
    characterX: 40,
    bubbleLeft: 600,
    bubbleWidth: 200,
    entranceSide: 'left',
    pointerWidth: LAYOUT.pointer,
    lean: LAYOUT.tailLean,
  });
  assert.ok(tail >= 600 + LAYOUT.pointer);
  assert.ok(tail <= 800 - LAYOUT.pointer);
});

test('the tail keeps a corner tile of clearance on both sides', () => {
  const tail = tailCenterX({
    characterX: 40,
    bubbleLeft: 600,
    bubbleWidth: 200,
    entranceSide: 'left',
    pointerWidth: LAYOUT.pointer,
    lean: LAYOUT.tailLean,
  });
  // The tail tile must not reach into the corner tiles, or it would cover
  // the rounded corner and break the bubble's outline open.
  assert.ok(tail - LAYOUT.pointer / 2 >= 600 + LAYOUT.tile);
  assert.ok(tail + LAYOUT.pointer / 2 <= 800 - LAYOUT.tile);
});

test('the tail leans as close to the corner as the clearance allows', () => {
  const tail = tailCenterX({
    characterX: 1200,
    bubbleLeft: 600,
    bubbleWidth: 200,
    entranceSide: 'right',
    pointerWidth: LAYOUT.pointer,
    lean: LAYOUT.tailLean,
  });
  assert.equal(tail, 800 - LAYOUT.pointer);
});

test('a bubble too narrow for the clearance centres the tail', () => {
  const tail = tailCenterX({
    characterX: 40,
    bubbleLeft: 600,
    bubbleWidth: 100,
    entranceSide: 'left',
    pointerWidth: LAYOUT.pointer,
    lean: LAYOUT.tailLean,
  });
  assert.equal(tail, 650);
});

test('the tail points at the character when the bubble is wide enough', () => {
  const characterX = characterCenterX(STAGE_W, 'left');
  const tail = tailCenterX({
    characterX,
    bubbleLeft: 0,
    bubbleWidth: 1000,
    entranceSide: 'left',
    pointerWidth: LAYOUT.pointer,
    lean: LAYOUT.tailLean,
  });
  assert.ok(Math.abs(tail - characterX) <= 1000 * LAYOUT.tailLean + 1);
});
