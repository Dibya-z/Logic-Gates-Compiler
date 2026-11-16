import { spawnSync, spawn } from 'node:child_process';
for (const args of [['test'], ['run', 'build']]) {
  const r = spawnSync('npm', args, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
const port = 5199;
const app = spawn('npm', ['run', 'dev', '--', '--port', String(port), '--strictPort'], { stdio: 'pipe' });
try {
  let served = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok && (await response.text()).includes('Logi-Compile')) { served = true; break; }
    } catch { /* The development server is still starting. */ }
  }
  if (!served) throw new Error('Development server did not serve the app.');
  console.log('Application smoke check: HTTP 200, Logi-Compile document served.');
} finally { app.kill('SIGTERM'); }
