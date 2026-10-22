/**
 * 页面取证：登录 → 取渲染结果 → 落快照（资源路径改写为本地绝对路径）→ 供无头浏览器截图
 */
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:3000';
const ROOT = path.resolve(__dirname, '..');
const OUT = process.argv[2] || path.join(ROOT, '.snapshot');

(async () => {
  // 1) 未登录访问页面：应 302 到登录页
  const anon = await fetch(`${BASE}/admin/upload`, { redirect: 'manual' });
  console.log('未登录访问 /admin/upload →', anon.status, anon.headers.get('location'));

  // 2) 登录
  const lg = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin12345' }),
  });
  const cookies = lg.headers.getSetCookie();
  const cookie = cookies[0].split(';')[0];
  console.log('登录 →', lg.status, cookie.slice(0, 12) + '...');

  // 3) 取上传页
  const page = await fetch(`${BASE}/admin/upload`, { headers: { cookie } });
  let html = await page.text();
  console.log('上传页 →', page.status, html.length, 'bytes');

  // 4) 资源路径改写为 file://
  const pub = path.join(ROOT, 'public').replace(/\\/g, '/');
  html = html
    .replace(/(href|src)="\/css\//g, `$1="file:///${pub}/css/`)
    .replace(/(href|src)="\/js\//g, `$1="file:///${pub}/js/`);

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'upload_page.html'), html, 'utf8');

  // 5) 分类 / 创作者接口
  const cats = await (await fetch(`${BASE}/api/categories`)).json();
  const crs = await (await fetch(`${BASE}/api/creators`)).json();
  console.log('分类数', cats.data.items.length, '创作者数', crs.data.items.length);

  console.log('快照:', path.join(OUT, 'upload_page.html'));
})();
