import test from 'node:test';
import assert from 'node:assert/strict';
import { isLoopbackAddress, verifyToken } from '../server/lib/http.js';

function request(address, authorization = '') {
  return { socket: { remoteAddress: address }, headers: { authorization } };
}

test('loopback requests remain token optional', () => {
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true);
  assert.equal(verifyToken(request('127.0.0.1'), 'configured-token', { requireRemoteToken: true }), true);
});

test('LAN requests require the configured bearer token', () => {
  assert.equal(verifyToken(request('192.168.1.25'), 'show-token', { requireRemoteToken: true }), false);
  assert.equal(verifyToken(request('192.168.1.25', 'Bearer show-token'), 'show-token', { requireRemoteToken: true }), true);
  assert.equal(verifyToken(request('192.168.1.25'), '', { requireRemoteToken: true }), false);
});
