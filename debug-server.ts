
import { spawn } from 'child_process';
const child = spawn('npx', ['tsx', 'server.ts'], { stdio: 'inherit' });
setTimeout(() => {
  console.log('Stopping server test...');
  child.kill();
  process.exit(0);
}, 15000);
