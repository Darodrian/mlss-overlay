// The characters, the animations they play and the sound they make.
//
// Every sprite sheet referenced here is generated into js/sprites/ by
// scripts/build-sprites.mjs, and every sound lives in wav/.
import { SHEETS } from './sprites/index.js';

function frameSize(sheetName) {
  const frame = SHEETS[sheetName]?.frames?.[0];
  return { w: frame?.w ?? 0, h: frame?.h ?? 0 };
}

function frameCount(sheetName) {
  return SHEETS[sheetName]?.frames?.length ?? 0;
}

const DEFINITIONS = {
  mario: {
    id: 'mario',
    name: 'Mario',
    command: 'mario',
    sound: 'wav/mario-talk.wav',
    defaultMessage: "It's-a me!",
    reactLoops: 1, // Mario thinks once and then holds the last frame
    reactHoldMs: 400,
    animations: {
      enter: 'mario-walk',
      talk: 'mario-talk',
      react: 'mario-think',
      exit: 'mario-walk',
    },
  },
  luigi: {
    id: 'luigi',
    name: 'Luigi',
    command: 'luigi',
    sound: 'wav/luigi-talk.wav',
    defaultMessage: "Let's-a go!",
    reactLoops: 2, // Luigi nods twice
    reactHoldMs: 0,
    animations: {
      enter: 'luigi-walk',
      talk: 'luigi-talk',
      react: 'luigi-nod',
      exit: 'luigi-walk',
    },
  },
};

export const CHARACTERS = Object.fromEntries(
  Object.entries(DEFINITIONS).map(([id, def]) => {
    const walkFrame = frameSize(def.animations.enter);
    const height = Math.max(
      ...Object.values(def.animations).map((name) => frameSize(name).h),
    );
    return [
      id,
      {
        ...def,
        walkFrame,
        height,
        talkFrames: frameCount(def.animations.talk),
        reactFrames: frameCount(def.animations.react),
      },
    ];
  }),
);

export const CHARACTER_LIST = Object.values(CHARACTERS);

// Everything the overlay draws is sized from the 8px tiles of the box frame,
// so a single scale factor moves the whole picture.
export const LAYOUT = {
  scale: 4,
  tile: 32, // one 8px frame tile
  pointer: 64, // the 16px "p" tile
  characterStandX: 0.14, // fraction of the stage width, measured from the entrance edge
  bubbleDiagX: 0.09, // fraction of the stage width the bubble sits away from the character
  bubbleGapY: 40, // px between the character's head and the bubble's bottom edge
  bubblePadding: 32, // px between the frame and the text (the frame is 16px thick)
  tailLean: 0.06, // fraction of the bubble width the tail leans toward the entrance side
  fontSize: 36, // Zpix is a 12px design font: 36px is 3x it, so the glyphs stay crisp
  maxBubbleWidthFrac: 0.42, // fraction of the stage width the bubble may use
  maxBubbleWidthPx: 560,
};

export const TIMINGS = {
  walkSpeedPxPerSec: 60, // source pixels per second, so the walk reads the same on any canvas
  frameMs: { walk: 90, talk: 110, react: 140 },
  talkLoopsMin: 2, // the talk sheet always plays at least this many times
  reactLoops: 2, // fallback for characters that do not pick their own
  reactHoldMs: 0, // fallback for characters that do not pick their own
  typeCharMs: 42, // typewriter pace per character
  maxTypeMs: 12_000,
};
