import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ensureDirectory } from './storage.js';

export class EventLogger {
  constructor(logFile) {
    this.logFile = logFile;
  }

  async log(entry) {
    await ensureDirectory(path.dirname(this.logFile));
    const record = { timestamp: new Date().toISOString(), ...entry };
    await appendFile(this.logFile, `${JSON.stringify(record)}\n`, 'utf8');
    return record;
  }

  async list(limit = 250) {
    try {
      const text = await readFile(this.logFile, 'utf8');
      return text.trim().split('\n').filter(Boolean).slice(-limit).reverse().map((line) => {
        try { return JSON.parse(line); } catch { return { timestamp: null, action: 'invalid-log-line', detail: line }; }
      });
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async clear() {
    await ensureDirectory(path.dirname(this.logFile));
    await writeFile(this.logFile, '', 'utf8');
  }
}
