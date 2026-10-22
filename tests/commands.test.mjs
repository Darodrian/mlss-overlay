import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sanitiseText,
  isAllowed,
  parseCommand,
  createQueue,
  cooldownKey,
} from '../js/commands.js';
import { CHARACTER_LIST } from '../js/characters.js';

const CONFIG = {
  maxLength: 120,
  permissions: {
    everyone: true,
    broadcaster: true,
    mod: true,
    vip: true,
    subscriber: true,
  },
};

test('sanitiseText strips urls, mentions and emoji, and respects maxLength', () => {
  assert.equal(sanitiseText('hi @someone https://x.y/z 😀 end', 120), 'hi end');
  assert.equal(sanitiseText('a'.repeat(200), 10).length, 10);
  assert.equal(sanitiseText('  lots   of   space  ', 120), 'lots of space');
});

test('sanitiseText keeps emoji-free text intact', () => {
  assert.equal(sanitiseText('Ciao! Come stai?', 120), 'Ciao! Come stai?');
});

test('isAllowed follows the permissions matrix', () => {
  assert.equal(isAllowed({}, { everyone: true }), true);

  const modsOnly = { everyone: false, mod: true, broadcaster: true };
  assert.equal(isAllowed({ mod: true }, modsOnly), true);
  assert.equal(isAllowed({ broadcaster: true }, modsOnly), true);
  assert.equal(isAllowed({ subscriber: true }, modsOnly), false);
  assert.equal(isAllowed({}, modsOnly), false);
});

test('parseCommand picks the character named in the command', () => {
  const parsed = parseCommand('mario hello there', CONFIG);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.character.id, 'mario');
  assert.equal(parsed.message, 'hello there');
});

test('parseCommand is case insensitive on the command word', () => {
  const parsed = parseCommand('Luigi hello', CONFIG);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.character.id, 'luigi');
});

test('parseCommand falls back to the character default line', () => {
  const parsed = parseCommand('luigi', CONFIG);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.message, 'Let\'s-a go!');
});

test('parseCommand rejects an unknown character', () => {
  assert.deepEqual(parseCommand('peach hello', CONFIG), {
    ok: false,
    reason: 'unknown-character',
  });
});

test('parseCommand rejects an empty message', () => {
  assert.deepEqual(parseCommand('   ', CONFIG), { ok: false, reason: 'empty' });
});

test('parseCommand sanitises the message it returns', () => {
  const parsed = parseCommand('mario look at https://x.y/z now', CONFIG);
  assert.equal(parsed.message, 'look at now');
});

test('parseCommand caps the message length', () => {
  const parsed = parseCommand(`mario ${'x'.repeat(300)}`, { ...CONFIG, maxLength: 20 });
  assert.equal(parsed.message.length, 20);
});

test('the queue plays jobs in order', async () => {
  const seen = [];
  const queue = createQueue({ minGapMs: 0, onJob: (job) => seen.push(job.user) });
  queue.enqueue({ user: 'a' });
  queue.enqueue({ user: 'b' });
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(seen, ['a', 'b']);
});

test('the queue waits for an async job to finish before starting the next', async () => {
  const order = [];
  const queue = createQueue({
    minGapMs: 0,
    onJob: async (job) => {
      order.push(`start:${job.user}`);
      await new Promise((r) => setTimeout(r, 30));
      order.push(`end:${job.user}`);
    },
  });
  queue.enqueue({ user: 'a' });
  queue.enqueue({ user: 'b' });
  await new Promise((r) => setTimeout(r, 120));
  assert.deepEqual(order, ['start:a', 'end:a', 'start:b', 'end:b']);
});

test('the queue keeps a minimum gap between messages', async () => {
  const starts = [];
  const queue = createQueue({
    minGapMs: 60,
    onJob: async (job) => {
      starts.push(Date.now());
    },
  });
  queue.enqueue({ user: 'a' });
  queue.enqueue({ user: 'b' });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(starts.length, 2);
  assert.ok(starts[1] - starts[0] >= 55, 'the second message should wait for the gap');
});

test('cooldowns are tracked per user', () => {
  const queue = createQueue({ minGapMs: 0 });
  assert.equal(queue.cooldownRemaining('alice'), 0);
  queue.markUsed('alice', 30_000);
  assert.ok(queue.cooldownRemaining('alice') > 0);
  assert.equal(queue.cooldownRemaining('bob'), 0);
});

test('the cooldown key separates characters of the same user', () => {
  const mario = cooldownKey('alice', 'mario');
  const luigi = cooldownKey('alice', 'luigi');
  assert.notEqual(mario, luigi);
  assert.equal(cooldownKey('Alice', 'Mario'), mario);
  assert.equal(cooldownKey(' alice ', 'mario'), mario);
});

test('the cooldown of one character does not block the other', () => {
  const queue = createQueue({ minGapMs: 0 });
  queue.markUsed(cooldownKey('alice', 'mario'), 30_000);
  assert.ok(queue.cooldownRemaining(cooldownKey('alice', 'mario')) > 0);
  assert.equal(queue.cooldownRemaining(cooldownKey('alice', 'luigi')), 0);
});

test('the snapshot reports what is playing and what is waiting', () => {
  const queue = createQueue({ minGapMs: 500 });
  queue.enqueue({ user: 'a', character: 'mario', message: 'hi' });
  const snap = queue.snapshot();
  assert.equal(snap.playing, true);
  assert.equal(snap.pending, 0);
  assert.equal(snap.items[0].user, 'a');
  queue.stop();
});

test('stopping the queue clears everything', () => {
  const queue = createQueue({ minGapMs: 100 });
  queue.enqueue({ user: 'a' });
  queue.enqueue({ user: 'b' });
  queue.stop();
  const snap = queue.snapshot();
  assert.equal(snap.playing, false);
  assert.equal(snap.pending, 0);
});

test('a job that throws does not wedge the queue', async () => {
  const seen = [];
  const queue = createQueue({
    minGapMs: 0,
    onJob: async (job) => {
      seen.push(job.user);
      if (job.user === 'a') throw new Error('boom');
    },
  });
  queue.enqueue({ user: 'a' });
  queue.enqueue({ user: 'b' });
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(seen, ['a', 'b']);
});

test('the character list used by the parser is the shared one', () => {
  assert.equal(CHARACTER_LIST.length, 2);
});

test('the gap between messages can be changed on the fly', async () => {
  const starts = [];
  const queue = createQueue({ minGapMs: 0, onJob: () => starts.push(Date.now()) });
  queue.setMinGap(60);
  queue.enqueue({ user: 'a' });
  queue.enqueue({ user: 'b' });
  await new Promise((r) => setTimeout(r, 220));
  assert.equal(starts.length, 2);
  assert.ok(starts[1] - starts[0] >= 55, 'the gap should be the new one');
});
