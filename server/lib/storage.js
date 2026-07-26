import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import path from 'node:path';

export async function ensureDirectory(directory) {
  await mkdir(directory, { recursive: true });
}

export async function readJson(filePath, fallback) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return structuredClone(fallback);
    throw error;
  }
}

export async function writeJsonAtomic(filePath, value) {
  await ensureDirectory(path.dirname(filePath));
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, filePath);
}

export function safeFileName(input) {
  const base = path.basename(String(input || 'audio-file'));
  const cleaned = base
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._ -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+/, '')
    .slice(0, 160);
  return cleaned || `audio-${Date.now()}.bin`;
}

export async function uniqueFilePath(directory, desiredName) {
  const extension = path.extname(desiredName);
  const stem = path.basename(desiredName, extension);
  let candidate = path.join(directory, desiredName);
  let index = 1;
  while (true) {
    try {
      await stat(candidate);
      candidate = path.join(directory, `${stem}-${index}${extension}`);
      index += 1;
    } catch (error) {
      if (error.code === 'ENOENT') return candidate;
      throw error;
    }
  }
}
