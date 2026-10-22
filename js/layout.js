// Pure geometry for the overlay stage: where the character stands, where the
// bubble goes and where the bubble's tail points. Everything is in screen
// pixels so the renderer can use the numbers as-is.
import { LAYOUT } from './characters.js';

// "left" means the character walks in from the left edge, so it stands on the
// left and the bubble leans away from that edge.
function awaySign(entranceSide) {
  return entranceSide === 'right' ? -1 : 1;
}

export function characterCenterX(stageWidth, entranceSide) {
  return entranceSide === 'right'
    ? stageWidth * (1 - LAYOUT.characterStandX)
    : stageWidth * LAYOUT.characterStandX;
}

export function bubbleBox({
  stageWidth,
  stageHeight,
  characterX,
  characterHeight,
  bubbleWidth,
  bubbleHeight,
  entranceSide,
  diagFraction = LAYOUT.bubbleDiagX,
  gapY = LAYOUT.bubbleGapY,
}) {
  const bottom = stageHeight - characterHeight - gapY;
  const centerX = characterX + awaySign(entranceSide) * stageWidth * diagFraction;
  const maxLeft = Math.max(0, stageWidth - bubbleWidth);
  const left = Math.min(Math.max(0, centerX - bubbleWidth / 2), maxLeft);

  return {
    left,
    top: bottom - bubbleHeight,
    width: bubbleWidth,
    height: bubbleHeight,
    bottom,
    centerX: left + bubbleWidth / 2,
  };
}

export function tailCenterX({
  characterX,
  bubbleLeft,
  bubbleWidth,
  entranceSide,
  pointerWidth = LAYOUT.pointer,
  lean = LAYOUT.tailLean,
}) {
  const toward = -awaySign(entranceSide);
  const target = characterX + toward * bubbleWidth * lean;
  // The tail tile is twice as wide as a corner tile, so its centre has to stay
  // a full tile away from both ends: otherwise the tile lies flush against
  // the corner and the bubble's outline breaks open there.
  const min = bubbleLeft + pointerWidth;
  const max = bubbleLeft + bubbleWidth - pointerWidth;
  if (min > max) return bubbleLeft + bubbleWidth / 2;
  return Math.min(Math.max(target, min), max);
}
