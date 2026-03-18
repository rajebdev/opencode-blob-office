import { spawn } from 'child_process';

let mockServerProcess: any;

async function globalSetup() {
  console.log('Starting mock server...');
  mockServerProcess = spawn('bun', ['run', 'blob-office-mock-server.ts', '2727'], {
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

  console.log('Mock server started successfully');
  // Store reference for teardown
  (global as any).mockServerProcess = mockServerProcess;
}

export default globalSetup;