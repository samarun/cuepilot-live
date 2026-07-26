import { spawn } from 'node:child_process';

const children = [];
const run = (command, args, name) => {
  const child = spawn(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`${name} exited with code ${code}`);
      shutdown(code);
    }
  });
  children.push(child);
};

const shutdown = (code = 0) => {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  process.exit(code);
};

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

run(process.execPath, ['server/server.js', '--dev'], 'API server');
run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', '--config', 'client/vite.config.js'], 'Vite');
