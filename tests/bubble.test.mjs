import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bubbleMarkup, bubbleSize } from '../js/bubble.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the bubble markup has the nine tiles, the tail and the text layer', () => {
  const html = bubbleMarkup();
  for (const name of ['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br']) {
    assert.ok(html.includes(`data-tile="${name}"`), `missing tile ${name}`);
  }
  assert.ok(html.includes('data-tile="p"'), 'missing the bubble tail');
  assert.ok(html.includes('bubble-text'), 'missing the text layer');
});

test('the corner tiles are painted over the tail', () => {
  const html = bubbleMarkup();
  const tail = html.indexOf('data-tile="p"');
  for (const corner of ['tl', 'tr', 'bl', 'br']) {
    assert.ok(
      html.indexOf(`data-tile="${corner}"`) > tail,
      `the ${corner} tile must be painted after the tail`,
    );
  }
});

test('the stylesheet points every tile at its png', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css', 'overlay.css'), 'utf8');
  for (const name of ['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br', 'p']) {
    assert.ok(css.includes(`box/${name}.png`), `css does not reference box/${name}.png`);
  }
});

test('the stylesheet keeps the pixel art unfiltered', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css', 'overlay.css'), 'utf8');
  assert.ok(css.includes('image-rendering: pixelated'), 'the overlay must not smooth the pixel art');
});

test('the bubble grows with the text', () => {
  const small = bubbleSize({ textWidth: 100, textHeight: 40, padding: 16 });
  const big = bubbleSize({ textWidth: 300, textHeight: 40, padding: 16 });
  assert.ok(big.width > small.width);
  assert.equal(small.height, 72);
});

test('the bubble never grows wider than the cap', () => {
  const size = bubbleSize({ textWidth: 5000, textHeight: 40, padding: 16, maxWidth: 400 });
  assert.equal(size.width, 400);
});

test('the bubble keeps its edges on the pixel grid', () => {
  const size = bubbleSize({ textWidth: 101, textHeight: 41, padding: 16, grid: 4 });
  assert.equal(size.width % 4, 0);
  assert.equal(size.height % 4, 0);
  assert.equal(size.width, 136);
  assert.equal(size.height, 76);
});

test('a bubble with no text is still a valid box', () => {
  const size = bubbleSize({ textWidth: 0, textHeight: 0, padding: 16 });
  assert.equal(size.width, 32);
  assert.equal(size.height, 32);
});
