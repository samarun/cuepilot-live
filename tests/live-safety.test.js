import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGoCue, resolvePlayPauseCue } from '../client/src/services/liveSafety.js';

const cues = [{ id: 'active' }, { id: 'selected' }, { id: 'armed' }];
const states = { active: { state: 'playing' }, selected: { state: 'ready' }, armed: { state: 'ready' } };

test('Live Safe Space keeps control of the unfinished active cue', () => {
  assert.equal(resolvePlayPauseCue(cues, states, 'selected', true)?.id, 'active');
});

test('Rehearsal Space follows mouse selection', () => {
  assert.equal(resolvePlayPauseCue(cues, states, 'selected', false)?.id, 'selected');
});

test('Live Safe GO launches only the armed cue', () => {
  assert.equal(resolveGoCue(cues, 'selected', null, true), null);
  assert.equal(resolveGoCue(cues, 'selected', 'armed', true)?.id, 'armed');
});
