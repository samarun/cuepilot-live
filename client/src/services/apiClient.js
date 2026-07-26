const jsonHeaders = { 'Content-Type': 'application/json' };

async function request(path, options = {}) {
  const response = await fetch(path, options);
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Request failed (${response.status})`);
    error.code = payload?.error?.code || 'REQUEST_FAILED';
    error.status = response.status;
    throw error;
  }
  return payload;
}

export const api = {
  health: () => request('/api/health'),
  status: () => request('/api/status'),
  getProject: () => request('/api/project'),
  saveProject: (project) => request('/api/project', { method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ project }) }),
  registerClient: (label) => request('/api/client/register', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ label }) }),
  heartbeat: (clientId) => request('/api/client/heartbeat', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ clientId }) }),
  takeControl: (clientId) => request('/api/client/take-control', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ clientId }) }),
  publishState: (clientId, state) => request('/api/client/state', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ clientId, state }) }),
  acknowledgeCommand: (clientId, commandId, status, message = '') => request('/api/client/command-ack', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ clientId, commandId, status, message }) }),
  commandStatus: (commandId) => request(`/api/v1/commands/${encodeURIComponent(commandId)}`),
  getLogs: () => request('/api/logs'),
  clearLogs: () => request('/api/logs', { method: 'DELETE' }),
  importMedia: async (file) => {
    const response = await fetch('/api/media/import', {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
      body: file
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || 'Media import failed');
    return payload;
  }
};
