import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, stat, unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { exec } from 'node:child_process';
import { EventLogger } from './lib/logger.js';
import { PlaybackClientManager } from './lib/playback-client-manager.js';
import { readJson, writeJsonAtomic, ensureDirectory, safeFileName, uniqueFilePath } from './lib/storage.js';
import { sendJson as sendJsonResponse, readJsonBody, allowCors, verifyToken } from './lib/http.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(currentDirectory, '..');
const distDirectory = path.join(rootDirectory, 'dist');
const mediaDirectory = path.join(rootDirectory, 'media');
const projectPath = path.join(rootDirectory, 'projects', 'current-project.json');
const settingsPath = path.join(rootDirectory, 'config', 'settings.json');
const defaultSettingsPath = path.join(rootDirectory, 'config', 'default.json');
const logger = new EventLogger(path.join(rootDirectory, 'logs', 'events.log'));
const clients = new PlaybackClientManager();
const isDev = process.argv.includes('--dev');
const apiVersion = '1.1.0';
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.flac': 'audio/flac'
};

const defaults = await readJson(defaultSettingsPath, {});
const settings = { ...defaults, ...(await readJson(settingsPath, {})) };
settings.apiToken = process.env.CUEPILOT_API_TOKEN || settings.apiToken || '';
if (settings.allowLanAccess && !settings.apiToken) {
  throw new Error('LAN access requires an API token. Set apiToken in config/settings.json or CUEPILOT_API_TOKEN.');
}
const host = process.env.HOST || (settings.allowLanAccess ? '0.0.0.0' : settings.host || '127.0.0.1');
const port = Number(process.env.PORT || settings.port || 8090);
const triggerCache = new Map();

await Promise.all([ensureDirectory(mediaDirectory), ensureDirectory(path.dirname(projectPath)), ensureDirectory(path.dirname(settingsPath))]);

function sendJson(response, status, payload, extraHeaders = {}) {
  const versionedPayload = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? { apiVersion, ...payload }
    : payload;
  return sendJsonResponse(response, status, versionedPayload, { 'X-CuePilot-API-Version': apiVersion, ...extraHeaders });
}

function sanitizeProject(project) {
  const cues = Array.isArray(project?.cues) ? project.cues.slice(0, 5000).map((cue, index) => ({
    id: String(cue.id || `cue-${index + 1}`).slice(0, 100),
    number: Number.isFinite(Number(cue.number)) ? Number(cue.number) : index + 1,
    name: String(cue.name || `Cue ${index + 1}`).slice(0, 160),
    description: String(cue.description || '').slice(0, 500),
    mediaUrl: String(cue.mediaUrl || '').slice(0, 500),
    fileName: String(cue.fileName || '').slice(0, 240),
    duration: Number(cue.duration || 0),
    shortcut: String(cue.shortcut || '').slice(0, 80),
    volume: Math.max(0, Math.min(1.5, Number(cue.volume ?? 1))),
    muted: Boolean(cue.muted),
    loop: Boolean(cue.loop),
    loopCount: Number.isFinite(Number(cue.loopCount)) ? Number(cue.loopCount) : 0,
    fadeInMs: Math.max(0, Number(cue.fadeInMs || 0)),
    fadeOutMs: Math.max(0, Number(cue.fadeOutMs || 800)),
    startTime: Math.max(0, Number(cue.startTime || 0)),
    endTime: Math.max(0, Number(cue.endTime || 0)),
    followAction: ['none', 'next'].includes(cue.followAction) ? cue.followAction : 'none',
    color: String(cue.color || 'emerald').slice(0, 40),
    triggerMode: ['restart', 'toggle', 'ignore'].includes(cue.triggerMode) ? cue.triggerMode : 'restart',
    group: String(cue.group || '').slice(0, 100)
  })) : [];
  const templates = Array.isArray(project?.templates) ? project.templates.slice(0, 100).map((template, index) => ({
    id: String(template.id || `template-${index + 1}`).slice(0, 100),
    name: String(template.name || `Template ${index + 1}`).slice(0, 120),
    values: {
      description: String(template.values?.description || '').slice(0, 500),
      volume: Math.max(0, Math.min(1.5, Number(template.values?.volume ?? 1))),
      muted: Boolean(template.values?.muted),
      loop: Boolean(template.values?.loop),
      fadeInMs: Math.max(0, Number(template.values?.fadeInMs || 0)),
      fadeOutMs: Math.max(0, Number(template.values?.fadeOutMs || 0)),
      color: String(template.values?.color || 'emerald').slice(0, 40),
      triggerMode: ['restart', 'toggle', 'ignore'].includes(template.values?.triggerMode) ? template.values.triggerMode : 'restart',
      followAction: ['none', 'next'].includes(template.values?.followAction) ? template.values.followAction : 'none',
      group: String(template.values?.group || '').slice(0, 100)
    }
  })) : [];
  return {
    schemaVersion: 2,
    id: String(project?.id || 'default-project').slice(0, 100),
    name: String(project?.name || 'Untitled project').slice(0, 160),
    updatedAt: new Date().toISOString(),
    cues,
    templates,
    settings: typeof project?.settings === 'object' && project.settings ? project.settings : {}
  };
}

async function loadProject() {
  return readJson(projectPath, { schemaVersion: 2, id: 'default-project', name: 'Untitled project', cues: [], templates: [], settings: {} });
}

function shouldDebounce(key) {
  const now = Date.now();
  const previous = triggerCache.get(key) || 0;
  triggerCache.set(key, now);
  return now - previous < Number(settings.triggerDebounceMs || 100);
}

async function dispatchCommand(command, source = 'api') {
  const key = `${command.type}:${command.cueId || 'global'}`;
  if (shouldDebounce(key)) return { success: false, status: 429, code: 'TRIGGER_DEBOUNCED', message: 'Repeated trigger ignored.' };
  const commandId = randomUUID();
  const result = clients.send({ ...command, commandId, source });
  await logger.log({ action: command.type, cueId: command.cueId || null, source, result: result.delivered ? 'delivered' : result.reason, commandId });
  if (!result.delivered) return { success: false, status: 409, code: result.reason, message: 'No active browser playback engine is connected.' };
  return { success: true, status: 202, commandId, commandStatus: 'delivered', statusUrl: `/api/v1/commands/${commandId}`, activeClientId: result.clientId };
}

function statusPayload(project) {
  const playback = clients.status();
  const owner = playback.clients.find((item) => item.id === playback.activeClientId) || null;
  const state = owner?.state || {};
  const activeCues = Array.isArray(state.activeCues) ? state.activeCues : [];
  const primary = activeCues.find((cue) => ['playing', 'fading'].includes(cue.state)) || activeCues[0] || null;
  return {
    success: true,
    server: { host, port, dev: isDev },
    playback,
    playbackOwner: {
      clientId: owner?.id || null,
      label: owner?.label || null,
      connected: Boolean(owner?.streamConnected),
      healthy: Boolean(owner?.streamConnected && owner.heartbeatAgeMs < clients.timeoutMs),
      heartbeatAgeMs: owner?.heartbeatAgeMs ?? null,
      engineStatus: state.status || 'offline'
    },
    show: {
      selectedCue: state.selectedCue || null,
      armedCue: state.armedCue || null,
      activeCue: primary,
      activeCues,
      cueStates: state.cueStates || {},
      transportState: state.transportState || 'stopped',
      timing: primary ? { position: primary.position || 0, duration: primary.duration || 0, remaining: primary.remaining || 0 } : { position: 0, duration: 0, remaining: 0 },
      liveSafe: Boolean(state.liveSafe),
      meters: state.meters || null
    },
    project: { id: project.id, name: project.name, cueCount: project.cues.length, schemaVersion: project.schemaVersion || 1 }
  };
}

async function serveFile(response, filePath, cache = true) {
  const fileStats = await stat(filePath);
  if (!fileStats.isFile()) throw Object.assign(new Error('Not found'), { code: 'ENOENT' });
  response.writeHead(200, {
    'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Content-Length': fileStats.size,
    'Cache-Control': cache ? 'public, max-age=31536000, immutable' : 'no-store'
  });
  createReadStream(filePath).pipe(response);
}

async function handleApi(request, response, url) {
  if (!verifyToken(request, settings.apiToken, { requireRemoteToken: Boolean(settings.allowLanAccess) })) return sendJson(response, 401, { success: false, error: { code: 'UNAUTHORIZED', message: 'A valid bearer token is required for LAN access.' } });

  if (request.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(response, 200, { success: true, status: 'ready', version: '1.1.0', time: new Date().toISOString() });
  }
  if (request.method === 'GET' && url.pathname === '/api/status') {
    const project = await loadProject();
    return sendJson(response, 200, statusPayload(project));
  }
  if (request.method === 'GET' && url.pathname === '/api/project') return sendJson(response, 200, { success: true, project: await loadProject() });
  if (request.method === 'PUT' && url.pathname === '/api/project') {
    const body = await readJsonBody(request);
    const project = sanitizeProject(body.project || body);
    await writeJsonAtomic(projectPath, project);
    await logger.log({ action: 'project-save', source: 'ui', result: 'success', detail: { cueCount: project.cues.length } });
    return sendJson(response, 200, { success: true, project });
  }
  if (request.method === 'GET' && url.pathname === '/api/cues') {
    const project = await loadProject();
    return sendJson(response, 200, { success: true, cues: project.cues });
  }
  if (request.method === 'GET' && url.pathname.startsWith('/api/cues/')) {
    const cueId = decodeURIComponent(url.pathname.split('/')[3] || '');
    const project = await loadProject();
    const cue = project.cues.find((item) => item.id === cueId);
    return cue ? sendJson(response, 200, { success: true, cue }) : sendJson(response, 404, { success: false, error: { code: 'CUE_NOT_FOUND', message: 'Cue not found.' } });
  }
  if (request.method === 'POST' && url.pathname === '/api/client/register') {
    const body = await readJsonBody(request);
    return sendJson(response, 201, { success: true, client: clients.register({ label: body.label, userAgent: request.headers['user-agent'] }) });
  }
  if (request.method === 'POST' && url.pathname === '/api/client/heartbeat') {
    const body = await readJsonBody(request);
    return clients.heartbeat(body.clientId) ? sendJson(response, 200, { success: true }) : sendJson(response, 404, { success: false, error: { code: 'CLIENT_NOT_FOUND', message: 'Playback client is not registered.' } });
  }
  if (request.method === 'POST' && url.pathname === '/api/client/take-control') {
    const body = await readJsonBody(request);
    return clients.takeControl(body.clientId) ? sendJson(response, 200, { success: true, playback: clients.status() }) : sendJson(response, 404, { success: false, error: { code: 'CLIENT_NOT_FOUND', message: 'Playback client is not registered.' } });
  }
  if (request.method === 'POST' && url.pathname === '/api/client/state') {
    const body = await readJsonBody(request, 200_000);
    return clients.updateState(body.clientId, body.state || {}) ? sendJson(response, 200, { success: true }) : sendJson(response, 404, { success: false, error: { code: 'CLIENT_NOT_FOUND', message: 'Playback client is not registered.' } });
  }
  if (request.method === 'POST' && url.pathname === '/api/client/command-ack') {
    const body = await readJsonBody(request);
    const command = clients.acknowledge(body.commandId, body.clientId, { status: body.status, message: body.message });
    return command
      ? sendJson(response, 200, { success: true, command })
      : sendJson(response, 404, { success: false, error: { code: 'COMMAND_NOT_FOUND', message: 'Command was not found or does not belong to this playback client.' } });
  }
  const commandStatusMatch = url.pathname.match(/^\/api\/commands\/([^/]+)$/);
  if (request.method === 'GET' && commandStatusMatch) {
    const command = clients.describeCommand(decodeURIComponent(commandStatusMatch[1]));
    return command
      ? sendJson(response, 200, { success: true, command })
      : sendJson(response, 404, { success: false, error: { code: 'COMMAND_NOT_FOUND', message: 'Command acknowledgement is no longer available.' } });
  }
  if (request.method === 'GET' && url.pathname === '/api/events') {
    const clientId = url.searchParams.get('clientId');
    response.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no'
    });
    response.write(`event: ready\ndata: ${JSON.stringify({ clientId, active: clients.activeClientId === clientId })}\n\n`);
    if (!clients.attachStream(clientId, response)) {
      response.write(`event: error\ndata: ${JSON.stringify({ code: 'CLIENT_NOT_FOUND' })}\n\n`);
      response.end();
      return;
    }
    const ping = setInterval(() => {
      if (response.writableEnded) return clearInterval(ping);
      response.write(`event: ping\ndata: ${Date.now()}\n\n`);
    }, 8_000);
    request.on('close', () => clearInterval(ping));
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/media/import') {
    const encodedName = String(request.headers['x-file-name'] || 'audio-file.bin');
    let originalName = encodedName;
    try { originalName = decodeURIComponent(encodedName); } catch {}
    const safeName = safeFileName(originalName);
    const filePath = await uniqueFilePath(mediaDirectory, safeName);
    const declaredLength = Number(request.headers['content-length'] || 0);
    if (declaredLength > Number(settings.maxUploadBytes)) return sendJson(response, 413, { success: false, error: { code: 'FILE_TOO_LARGE', message: 'Audio file exceeds upload limit.' } });
    let received = 0;
    const maxUploadBytes = Number(settings.maxUploadBytes);
    const limiter = new Transform({
      transform(chunk, encoding, callback) {
        received += chunk.length;
        if (received > maxUploadBytes) {
          const error = new Error('Audio file exceeds upload limit.');
          error.code = 'PAYLOAD_TOO_LARGE';
          callback(error);
          return;
        }
        callback(null, chunk);
      }
    });
    try {
      await pipeline(request, limiter, createWriteStream(filePath, { flags: 'wx' }));
    } catch (error) {
      await unlink(filePath).catch(() => {});
      throw error;
    }
    const storedName = path.basename(filePath);
    await logger.log({ action: 'media-import', source: 'ui', result: 'success', detail: { fileName: storedName, bytes: received } });
    return sendJson(response, 201, { success: true, media: { fileName: storedName, mediaUrl: `/media/${encodeURIComponent(storedName)}`, bytes: received } });
  }
  if (request.method === 'GET' && url.pathname === '/api/logs') return sendJson(response, 200, { success: true, logs: await logger.list(Number(url.searchParams.get('limit') || 250)) });
  if (request.method === 'DELETE' && url.pathname === '/api/logs') { await logger.clear(); return sendJson(response, 200, { success: true }); }

  const cueActionMatch = url.pathname.match(/^\/api\/cues\/([^/]+)\/(play|pause|resume|stop|restart|fade-out|toggle|seek|volume|loop|arm)$/);
  if (request.method === 'POST' && cueActionMatch) {
    const cueId = decodeURIComponent(cueActionMatch[1]);
    const action = cueActionMatch[2];
    const project = await loadProject();
    if (!project.cues.some((cue) => cue.id === cueId)) return sendJson(response, 404, { success: false, error: { code: 'CUE_NOT_FOUND', message: 'Cue not found.' } });
    const body = ['play', 'restart', 'toggle', 'seek', 'volume', 'loop'].includes(action) ? await readJsonBody(request) : {};
    const result = await dispatchCommand({ type: action, cueId, payload: body }, 'api');
    return sendJson(response, result.status, result.success ? result : { success: false, error: { code: result.code, message: result.message } });
  }
  const transportMatch = url.pathname.match(/^\/api\/transport\/(stop-all|fade-out-all|pause-all|resume-all|next|previous|go|panic)$/);
  if (request.method === 'POST' && transportMatch) {
    const result = await dispatchCommand({ type: transportMatch[1] }, 'api');
    return sendJson(response, result.status, result.success ? result : { success: false, error: { code: result.code, message: result.message } });
  }

  return sendJson(response, 404, { success: false, error: { code: 'NOT_FOUND', message: 'API endpoint not found.' } });
}

const server = http.createServer(async (request, response) => {
  try {
    allowCors(request, response, settings.corsAllowlist || []);
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    const url = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`);
    if (url.pathname === '/api/v1' || url.pathname.startsWith('/api/v1/')) url.pathname = url.pathname.replace(/^\/api\/v1/, '/api');
    if (url.pathname.startsWith('/api/')) return await handleApi(request, response, url);
    if (url.pathname.startsWith('/media/')) {
      const requestedName = safeFileName(decodeURIComponent(url.pathname.slice('/media/'.length)));
      return await serveFile(response, path.join(mediaDirectory, requestedName), false);
    }
    if (isDev) return sendJson(response, 404, { success: false, error: { code: 'DEV_UI_ON_VITE', message: 'Open http://127.0.0.1:5173 during development.' } });
    const relativePath = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
    let filePath = path.resolve(distDirectory, relativePath);
    if (!filePath.startsWith(distDirectory)) return sendJson(response, 403, { success: false, error: { code: 'FORBIDDEN', message: 'Invalid path.' } });
    try { await serveFile(response, filePath, !filePath.endsWith('index.html')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      filePath = path.join(distDirectory, 'index.html');
      await serveFile(response, filePath, false);
    }
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendJson(response, error.code === 'PAYLOAD_TOO_LARGE' ? 413 : 500, { success: false, error: { code: error.code || 'INTERNAL_ERROR', message: error.message || 'Internal server error.' } });
    else response.end();
  }
});

server.listen(port, host, () => {
  const displayHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  const url = isDev ? 'http://127.0.0.1:5173' : `http://${displayHost}:${port}`;
  console.log(`CuePilot Live ${isDev ? 'API' : 'production'} server: ${url}`);
  if (!isDev && settings.openBrowser !== false && process.env.NO_OPEN !== '1') {
    const command = process.platform === 'darwin' ? `open "${url}"` : process.platform === 'win32' ? `start "" "${url}"` : `xdg-open "${url}"`;
    exec(command, () => {});
  }
});
