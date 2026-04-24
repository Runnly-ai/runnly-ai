import { spawn } from 'node:child_process';

const action = process.argv[2];
const stack = process.env.FRONTEND_STACK || 'next';
const dir = process.env.FRONTEND_DIR || 'ui';
const port = process.env.FRONTEND_PORT || '3001';

const run = (command, args, cwd = process.cwd()) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      cwd,
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'null'}`));
    });

    child.on('error', reject);
  });

const main = async () => {
  if (!action) {
    throw new Error('Missing frontend action. Use one of: dev, build, start, lint');
  }

  if (stack === 'none') {
    console.log('FRONTEND_STACK=none, skipping frontend command.');
    return;
  }

  if (stack !== 'next') {
    throw new Error(`Unsupported FRONTEND_STACK=${stack}. Supported: next, none`);
  }

  if (action === 'dev') {
    await run('next', ['dev', '.', '-p', port], dir);
    return;
  }
  if (action === 'build') {
    await run('next', ['build', '.'], dir);
    return;
  }
  if (action === 'start') {
    await run('next', ['start', '.', '-p', port], dir);
    return;
  }
  if (action === 'lint') {
    await run('next', ['lint', '.'], dir);
    return;
  }

  throw new Error(`Unsupported frontend action: ${action}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
