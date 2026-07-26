import { randomUUID } from 'node:crypto';

export class PlaybackClientManager {
  constructor({ timeoutMs = 12_000, commandTimeoutMs = 5_000, commandRetentionMs = 300_000 } = {}) {
    this.clients = new Map();
    this.activeClientId = null;
    this.timeoutMs = timeoutMs;
    this.commandTimeoutMs = commandTimeoutMs;
    this.commandRetentionMs = commandRetentionMs;
    this.commandHistory = new Map();
    this.cleanupTimer = setInterval(() => this.cleanup(), 3_000).unref();
  }

  register(meta = {}) {
    const id = randomUUID();
    this.clients.set(id, {
      id,
      label: meta.label || 'Browser client',
      userAgent: meta.userAgent || '',
      connectedAt: Date.now(),
      heartbeatAt: Date.now(),
      response: null,
      state: { status: 'idle', activeCues: [], meters: null }
    });
    if (!this.activeClientId) this.activeClientId = id;
    return this.describe(id);
  }

  heartbeat(id) {
    const client = this.clients.get(id);
    if (!client) return false;
    client.heartbeatAt = Date.now();
    return true;
  }

  attachStream(id, response) {
    const client = this.clients.get(id);
    if (!client) return false;
    client.response = response;
    client.heartbeatAt = Date.now();
    return true;
  }

  takeControl(id) {
    if (!this.clients.has(id)) return false;
    this.activeClientId = id;
    return true;
  }

  release(id) {
    const client = this.clients.get(id);
    if (client?.response && !client.response.writableEnded) client.response.end();
    this.clients.delete(id);
    if (this.activeClientId === id) {
      this.activeClientId = [...this.clients.keys()][0] || null;
    }
  }

  updateState(id, state) {
    const client = this.clients.get(id);
    if (!client) return false;
    client.state = { ...client.state, ...state };
    client.heartbeatAt = Date.now();
    return true;
  }

  send(command) {
    const client = this.clients.get(this.activeClientId);
    if (!client?.response || client.response.writableEnded) {
      return { delivered: false, reason: 'NO_ACTIVE_PLAYBACK_CLIENT' };
    }
    const commandId = command.commandId || randomUUID();
    const payload = { ...command, commandId, issuedAt: new Date().toISOString() };
    client.response.write(`event: command\ndata: ${JSON.stringify(payload)}\n\n`);
    const now = Date.now();
    this.commandHistory.set(commandId, {
      commandId,
      type: payload.type,
      cueId: payload.cueId || null,
      source: payload.source || 'api',
      clientId: client.id,
      status: 'delivered',
      issuedAt: payload.issuedAt,
      deliveredAt: new Date(now).toISOString(),
      updatedAt: now,
      message: ''
    });
    return { delivered: true, commandId, clientId: client.id };
  }

  acknowledge(commandId, clientId, { status, message = '' } = {}) {
    const command = this.commandHistory.get(commandId);
    if (!command || command.clientId !== clientId) return null;
    if (!['executed', 'rejected'].includes(status)) return null;
    command.status = status;
    command.message = String(message || '').slice(0, 500);
    command.acknowledgedAt = new Date().toISOString();
    command.updatedAt = Date.now();
    return this.describeCommand(commandId);
  }

  describeCommand(commandId) {
    const command = this.commandHistory.get(commandId);
    if (!command) return null;
    if (command.status === 'delivered' && Date.now() - command.updatedAt > this.commandTimeoutMs) {
      command.status = 'timed-out';
      command.timedOutAt = new Date().toISOString();
      command.updatedAt = Date.now();
    }
    const { updatedAt, ...description } = command;
    return description;
  }

  cleanup() {
    const now = Date.now();
    for (const [id, client] of this.clients) {
      if (now - client.heartbeatAt > this.timeoutMs) this.release(id);
    }
    for (const [id, command] of this.commandHistory) {
      if (command.status === 'delivered' && now - command.updatedAt > this.commandTimeoutMs) this.describeCommand(id);
      if (now - command.updatedAt > this.commandRetentionMs) this.commandHistory.delete(id);
    }
  }

  describe(id) {
    const client = this.clients.get(id);
    if (!client) return null;
    return {
      id: client.id,
      label: client.label,
      connectedAt: new Date(client.connectedAt).toISOString(),
      heartbeatAt: new Date(client.heartbeatAt).toISOString(),
      heartbeatAgeMs: Math.max(0, Date.now() - client.heartbeatAt),
      active: id === this.activeClientId,
      streamConnected: Boolean(client.response && !client.response.writableEnded),
      state: client.state
    };
  }

  status() {
    return {
      activeClientId: this.activeClientId,
      clients: [...this.clients.keys()].map((id) => this.describe(id))
    };
  }
}
