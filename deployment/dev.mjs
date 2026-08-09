import { spawn } from 'node:child_process';
import process from 'node:process';

const processes = [
  spawn('npm', ['run', 'dev', '--workspace', 'backend'], { stdio: 'inherit', shell: false }),
  spawn('npm', ['run', 'dev', '--workspace', 'frontend'], { stdio: 'inherit', shell: false })
];

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) child.kill('SIGTERM');
  setTimeout(() => process.exit(exitCode), 300).unref();
}

for (const child of processes) {
  child.on('exit', (code, signal) => {
    if (!stopping && code !== 0) {
      console.error(`Development process stopped (${signal || code}).`);
      stop(code || 1);
    }
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
