async function globalTeardown() {
  console.log('Stopping mock server...');
  const mockServerProcess = (global as any).mockServerProcess;
  if (mockServerProcess) {
    mockServerProcess.kill();
    // Wait a bit for graceful shutdown
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.log('Mock server stopped');
}

export default globalTeardown;