import test from 'node:test';
import assert from 'node:assert/strict';
import { safeFileName } from '../server/lib/storage.js';

 test('safeFileName removes traversal and unsafe characters', () => {
  assert.equal(safeFileName('../../My Cue (Final) #1.mp3'), 'My-Cue-Final-1.mp3');
  assert.equal(safeFileName('..\\..\\bad?.wav'), 'bad.wav');
});

test('safeFileName provides a fallback', () => {
  assert.match(safeFileName('###'), /^audio-\d+\.bin$/);
});
