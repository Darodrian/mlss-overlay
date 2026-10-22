import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { convertSheet, renderModule, listSheets } from '../scripts/build-sprites.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPRITES_DIR = path.join(ROOT, 'sprites');
const GENERATED_DIR = path.join(ROOT, 'js', 'sprites');

const sheetJson = (name) =>
  JSON.parse(fs.readFileSync(path.join(SPRITES_DIR, `${name}.json`), 'utf8'));

test('convertSheet orders frames by their numeric suffix', () => {
  const json = {
    frames: {
      frame_002: { frame: { x: 20, y: 0, w: 10, h: 10 }, rotated: false },
      frame_000: { frame: { x: 0, y: 0, w: 10, h: 10 }, rotated: false },
      frame_001: { frame: { x: 10, y: 0, w: 10, h: 10 }, rotated: false },
    },
    meta: { image: 'spritesheet.png', size: { w: 30, h: 10 } },
  };
  assert.deepEqual(
    convertSheet('demo', json).frames.map((f) => f.x),
    [0, 10, 20],
  );
});

test('convertSheet points the image at the real png, not at meta.image', () => {
  const json = {
    frames: { frame_000: { frame: { x: 0, y: 0, w: 1, h: 1 }, rotated: false } },
    meta: { image: 'spritesheet.png', size: { w: 1, h: 1 } },
  };
  assert.equal(convertSheet('mario-talk', json).image, '../../sprites/mario-talk.png');
});

test('convertSheet carries the sheet size over', () => {
  const json = {
    frames: { frame_000: { frame: { x: 0, y: 0, w: 1, h: 1 }, rotated: false } },
    meta: { size: { w: 96, h: 36 } },
  };
  assert.deepEqual(convertSheet('mario-talk', json).size, { w: 96, h: 36 });
});

test('convertSheet rejects rotated frames loudly', () => {
  const json = {
    frames: { frame_000: { frame: { x: 0, y: 0, w: 10, h: 20 }, rotated: true } },
    meta: { size: { w: 10, h: 20 } },
  };
  assert.throws(() => convertSheet('demo', json), /rotated/i);
});

test('every sheet on disk has a generated module whose image path resolves', async () => {
  const names = listSheets(SPRITES_DIR);
  assert.ok(names.length > 0, 'expected sprite sheets in sprites/');

  for (const name of names) {
    const modPath = path.join(GENERATED_DIR, `${name}.js`);
    assert.ok(fs.existsSync(modPath), `missing generated module js/sprites/${name}.js`);

    const mod = await import(pathToFileURL(modPath).href);
    assert.equal(mod.name, name);
    assert.ok(fs.existsSync(fileURLToPath(mod.image)), `image path does not resolve for ${name}`);
    assert.deepEqual(mod.frames, convertSheet(name, sheetJson(name)).frames);
  }
});

test('generated modules are up to date with their json sources', () => {
  for (const name of listSheets(SPRITES_DIR)) {
    const expected = renderModule(name, convertSheet(name, sheetJson(name)));
    const actual = fs.readFileSync(path.join(GENERATED_DIR, `${name}.js`), 'utf8');
    assert.equal(actual, expected, `js/sprites/${name}.js is stale - run npm run build:sprites`);
  }
});
