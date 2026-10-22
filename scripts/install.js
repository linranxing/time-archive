/**
 * 安装依赖（保证在工程目录内执行，避免 cwd 漂移）
 * 用法: node scripts/install.js
 */
const { spawnSync } = require('child_process');
const path = require('path');

const dir = path.resolve(__dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const r = spawnSync(npm, ['install', '--no-audit', '--no-fund', '--loglevel=error'], {
  cwd: dir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
console.log('npm install exit code:', r.status);
process.exit(r.status || 0);
