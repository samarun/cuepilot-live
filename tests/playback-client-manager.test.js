import test from 'node:test';
import assert from 'node:assert/strict';
import { PlaybackClientManager } from '../server/lib/playback-client-manager.js';

function fakeResponse() {
  return {
    writableEnded: false,
    output: '',
    write(chunk) { this.output += chunk; },
    end() { this.writableEnded = true; }
  };
}

test('first registered client becomes active', () => {
  const manager = new PlaybackClientManager({ timeoutMs: 100000 });
  const client = manager.register({ label: 'Test' });
  assert.equal(manager.activeClientId, client.id);
  manager.cleanupTimer && clearInterval(manager.cleanupTimer);
});

test('commands are delivered only through the active stream', () => {
  const manager = new PlaybackClientManager({ timeoutMs: 100000 });
  const first = manager.register({ label: 'First' });
  const second = manager.register({ label: 'Second' });
  const firstResponse = fakeResponse();
  const secondResponse = fakeResponse();
  manager.attachStream(first.id, firstResponse);
  manager.attachStream(second.id, secondResponse);
  const result = manager.send({ type: 'play', cueId: 'cue-1' });
  assert.equal(result.delivered, true);
  assert.match(firstResponse.output, /"cueId":"cue-1"/);
  assert.equal(secondResponse.output, '');
  manager.cleanupTimer && clearInterval(manager.cleanupTimer);
});

test('takeControl changes command ownership', () => {
  const manager = new PlaybackClientManager({ timeoutMs: 100000 });
  const first = manager.register({ label: 'First' });
  const second = manager.register({ label: 'Second' });
  const secondResponse = fakeResponse();
  manager.attachStream(second.id, secondResponse);
  assert.equal(manager.takeControl(second.id), true);
  const result = manager.send({ type: 'panic' });
  assert.equal(result.clientId, second.id);
  assert.match(secondResponse.output, /"type":"panic"/);
  manager.release(first.id);
  manager.release(second.id);
  manager.cleanupTimer && clearInterval(manager.cleanupTimer);
});

test('command acknowledgements progress from delivered to executed', () => {
  const manager = new PlaybackClientManager({ timeoutMs: 100000 });
  const client = manager.register({ label: 'Operator' });
  manager.attachStream(client.id, fakeResponse());
  const sent = manager.send({ type: 'play', cueId: 'cue-1' });
  assert.equal(manager.describeCommand(sent.commandId).status, 'delivered');
  assert.equal(manager.acknowledge(sent.commandId, 'wrong-client', { status: 'executed' }), null);
  const acknowledged = manager.acknowledge(sent.commandId, client.id, { status: 'executed' });
  assert.equal(acknowledged.status, 'executed');
  assert.ok(acknowledged.acknowledgedAt);
  manager.cleanupTimer && clearInterval(manager.cleanupTimer);
});

test('unacknowledged commands become timed out', () => {
  const manager = new PlaybackClientManager({ timeoutMs: 100000, commandTimeoutMs: 5 });
  const client = manager.register({ label: 'Operator' });
  manager.attachStream(client.id, fakeResponse());
  const sent = manager.send({ type: 'go' });
  manager.commandHistory.get(sent.commandId).updatedAt -= 10;
  assert.equal(manager.describeCommand(sent.commandId).status, 'timed-out');
  manager.cleanupTimer && clearInterval(manager.cleanupTimer);
});
