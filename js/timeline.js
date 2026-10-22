// Pure timing math for the overlay sequence: how long the walk takes and how
// long the typewriter runs.
import { TIMINGS, LAYOUT } from './characters.js';

// Distance in source pixels from off-screen to the character's stand position.
export function walkDistancePx({
  stageWidth,
  scale,
  characterWidth,
  standFraction,
  entranceSide,
}) {
  const stageSource = stageWidth / scale;
  const stand =
    entranceSide === 'right'
      ? stageSource * (1 - standFraction)
      : stageSource * standFraction;
  const start =
    entranceSide === 'right' ? stageSource + characterWidth / 2 : -characterWidth / 2;
  return Math.abs(stand - start);
}

export function walkDurationMs(distancePx, speedPxPerSec = TIMINGS.walkSpeedPxPerSec) {
  if (!distancePx || speedPxPerSec <= 0) return 0;
  return (distancePx / speedPxPerSec) * 1000;
}

// The typewriter is paced to the sound, but never so fast that the text turns
// into a blur and never so slow that it outruns the cap.
export function typeDurationMs(text, soundMs = 0, timings = TIMINGS) {
  const chars = Array.from(String(text ?? '')).length;
  if (chars === 0) return 0;
  const perChar = Math.min(timings.typeCharMs, timings.maxTypeMs / chars);
  const typed = chars * perChar;
  return Math.min(Math.max(soundMs || 0, typed), timings.maxTypeMs);
}

// How long one full cycle of a sheet takes.
export function sheetLoopMs(frames, frameMs) {
  const count = Math.max(1, Math.floor(frames) || 1);
  const ms = Number(frameMs);
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return count * ms;
}

// The talk sheet keeps bobbing for as long as the message takes, and always
// finishes on a whole cycle. A short message still gets the minimum.
export function talkLoopCount({
  typeMs,
  frames,
  frameMs,
  minLoops = 2,
} = {}) {
  const loop = sheetLoopMs(frames, frameMs);
  if (loop <= 0) return Math.max(1, minLoops);
  const wanted = Math.ceil(Math.max(0, Number(typeMs) || 0) / loop);
  return Math.max(minLoops, wanted);
}

// The reaction gesture plays a number of times and then holds its last frame
// for a moment before the character leaves.
export function reactTiming({ character, timings = TIMINGS } = {}) {
  const loops = Math.max(1, Math.floor(Number(character?.reactLoops ?? timings.reactLoops) || 1));
  const holdMs = Math.max(0, Number(character?.reactHoldMs ?? timings.reactHoldMs) || 0);
  const frames = Math.max(1, Math.floor(Number(character?.reactFrames) || 1));
  const ms = loops * sheetLoopMs(frames, timings.frameMs.react) + holdMs;
  return { reactLoops: loops, reactHoldMs: holdMs, reactMs: ms };
}

// The whole run of one message: walk in, talk, react, walk out.
export function buildSequence({
  character,
  message,
  stageWidth,
  entranceSide = 'left',
  soundMs = 0,
  timings = TIMINGS,
  layout = LAYOUT,
}) {
  const distance = walkDistancePx({
    stageWidth,
    scale: layout.scale,
    characterWidth: character.walkFrame.w,
    standFraction: layout.characterStandX,
    entranceSide,
  });
  const walkMs = walkDurationMs(distance, timings.walkSpeedPxPerSec);
  const typeMs = typeDurationMs(message, soundMs, timings);

  const talkLoopMs = sheetLoopMs(character.talkFrames, timings.frameMs.talk);
  const talkLoops = talkLoopCount({
    typeMs,
    frames: character.talkFrames,
    frameMs: timings.frameMs.talk,
    minLoops: timings.talkLoopsMin,
  });
  const talkMs = talkLoops * talkLoopMs;

  const react = reactTiming({ character, timings });

  return {
    walkMs,
    typeMs,
    talkLoops,
    talkMs,
    reactLoops: react.reactLoops,
    reactHoldMs: react.reactHoldMs,
    reactMs: react.reactMs,
    exitMs: walkMs,
    totalMs: walkMs + talkMs + react.reactMs + walkMs,
  };
}
