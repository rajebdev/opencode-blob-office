import { spawn } from 'child_process';
import { createServer } from 'net';
import { writeFileSync } from 'fs';
import { join } from 'path';

let mockServerProcess: any;

const PORT_FILE = join(process.cwd(), 'test-results', '.mock-server-port');

/** Find a free port starting from `start`, scanning up to 10 ports */
async function findFreePort(start: number): Promise<number> {
  for (let port = start; port < start + 10; port++) {
    const free = await new Promise<boolean>((resolve) => {
      const srv = createServer();
      srv.once('error', () => resolve(false));
      srv.once('listening', () => { srv.close(); resolve(true); });
      srv.listen(port); // Bind on all interfaces (same as Bun.serve)
    });
    if (free) return port;
  }
  throw new Error(`No free port found in range ${start}–${start + 9}`);
}

async function globalSetup() {
  const port = await findFreePort(2727);
  console.log(`Starting mock server on port ${port}...`);

  mockServerProcess = spawn('bun', ['run', 'blob-office-mock-server.ts', String(port)], {
    stdio: ['pipe', 'pipe', 'inherit'], // inherit stderr for visibility
    cwd: process.cwd(),
  });

  // Wait for server to start
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Mock server failed to start within 10 seconds'));
    }, 10000);

    mockServerProcess.stdout.on('data', (data: Buffer) => {
      const output = data.toString();
      console.log('Mock server stdout:', output.trim());
      if (output.includes('Ready at')) {
        clearTimeout(timeout);
        resolve();
      }
    });

    mockServerProcess.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  console.log(`Mock server started on port ${port}`);

  // Write port to file so test workers can read it
  const { mkdirSync } = await import('fs');
  mkdirSync(join(process.cwd(), 'test-results'), { recursive: true });
  writeFileSync(PORT_FILE, String(port));

  // Store for teardown
  (global as any).mockServerProcess = mockServerProcess;
}

export default globalSetup;

export { PORT_FILE };