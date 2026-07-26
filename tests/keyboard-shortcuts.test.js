import test from 'node:test';
import assert from 'node:assert/strict';
import { historyActionFromEvent, isShortcutEntryTarget, isTextEditingTarget } from '../client/src/services/keyboardShortcuts.js';

test('Cmd+Z and Ctrl+Z resolve to undo', () => {
  assert.equal(historyActionFromEvent({ key: 'z', metaKey: true }), 'undo');
  assert.equal(historyActionFromEvent({ key: 'Z', ctrlKey: true }), 'undo');
});

test('Cmd/Ctrl+Shift+Z and Ctrl+Y resolve to redo', () => {
  assert.equal(historyActionFromEvent({ key: 'z', metaKey: true, shiftKey: true }), 'redo');
  assert.equal(historyActionFromEvent({ key: 'z', ctrlKey: true, shiftKey: true }), 'redo');
  assert.equal(historyActionFromEvent({ key: 'y', ctrlKey: true }), 'redo');
});

test('history shortcuts work from sliders but leave text editing alone', () => {
  const slider = { tagName: 'INPUT', type: 'range' };
  const text = { tagName: 'INPUT', type: 'text' };
  assert.equal(isTextEditingTarget(slider), false);
  assert.equal(isShortcutEntryTarget(slider), true);
  assert.equal(isTextEditingTarget(text), true);
});
