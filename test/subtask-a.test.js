/**
 * 子任务 A 验收测试：接口契约 14 字段 / 11 错误码 / 三档落盘 / 鉴权
 * 运行：npm run test:a
 */
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

process.env.PORT = process.env.PORT || '3100';
const app = require('../app');
const { PATH } = require('../config/constants');

const PORT = 3100;
const BASE = `http://127.0.0.1:${PORT}`;

let cookie = '';
const results = [];

function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  → ' + detail : ''}`);
}

async function post(fields, file) {
  const fd = new FormData();
  Object.keys(fields || {}).forEach((k) => {
    if (fields[k] !== undefined && fields[k] !== null) fd.append(k, String(fields[k]));
  });
  if (file) fd.append('coverImage', new Blob([file.buf], { type: file.type }), file.name);

  const res = await fetch(`${BASE}/api/admin/works`, {
    method: 'POST',
    body: fd,
    headers: cookie ? { cookie } : {},
  });
  let body = null;
  try { body = await res.json(); } catch (_) { body = null; }
  return { status: res.status, body };
}

async function login() {
  const res = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin12345' }),
  });
  const body = await res.json().catch(() => null);
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const sid = (raw[0] || '').split(';')[0];
  return { status: res.status, body, sid };
}

(async function main() {
  const server = app.listen(PORT);
  await new Promise((r) => server.once('listening', r));

  // ---------- 测试素材 ----------
  const jpg = await sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 20, g: 40, b: 90 } },
  }).jpeg().toBuffer();

  const pngBig = await sharp({
    create: { width: 2000, height: 1000, channels: 3, background: { r: 90, g: 40, b: 20 } },
  }).png().toBuffer();

  const pngOk = await sharp({
    create: { width: 1200, height: 900, channels: 3, background: { r: 30, g: 60, b: 80 } },
  }).png().toBuffer();

  const bigBuf = Buffer.alloc(Math.round(2.1 * 1024 * 1024), 0x41);
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]).copy(bigBuf, 0);

  const baseFields = {
    title: '测试作品 · 旧城一角',
    authorId: 'CR-001',
    categoryId: 'ARCHIVE-001',
    description: '用于人工初审的测试作品。',
    concept: '测试创作理念。',
    materials: '纸本设色',
    createdAt: '2024-05-01',
  };

  console.log('=== 接口一 POST /api/admin/works 验收测试 ===\n');

  // 1) 40101 未登录
  let r = await post(baseFields, { buf: jpg, type: 'image/jpeg', name: 'a.jpg' });
  check('40101 未登录调用', r.status === 401 && r.body.error.code === 40101, `HTTP ${r.status} code ${r.body.error && r.body.error.code}`);

  // 2) 40102 登录失败
  const bad = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'wrong' }),
  });
  const badBody = await bad.json();
  check('40102 账号或密码错误', bad.status === 401 && badBody.error.code === 40102, `HTTP ${bad.status} code ${badBody.error.code}`);

  // 3) 登录成功
  const lg = await login();
  cookie = lg.sid;
  check('管理员登录成功并下发会话', lg.status === 200 && !!cookie, `HTTP ${lg.status} cookie=${cookie.slice(0, 14)}...`);

  // 4) 40001 缺 title
  r = await post({ ...baseFields, title: '' }, { buf: jpg, type: 'image/jpeg', name: 'a.jpg' });
  check('40001 缺少 title', r.status === 400 && r.body.error.code === 40001, `HTTP ${r.status} ${r.body.error.message}`);

  // 5) 40001 缺封面
  r = await post(baseFields, null);
  check('40001 缺少 coverImage', r.status === 400 && r.body.error.code === 40001, `HTTP ${r.status} ${r.body.error.message}`);

  // 6) 40002 title 超长（61 字）
  r = await post({ ...baseFields, title: '长'.repeat(61) }, { buf: jpg, type: 'image/jpeg', name: 'a.jpg' });
  check('40002 名称超过 60 字', r.status === 400 && r.body.error.code === 40002, `HTTP ${r.status} ${r.body.error.message}`);

  // 7) 40003 分类编号不存在
  r = await post({ ...baseFields, categoryId: 'ARCHIVE-009' }, { buf: jpg, type: 'image/jpeg', name: 'a.jpg' });
  check('40003 分类编号不存在', r.status === 400 && r.body.error.code === 40003, `HTTP ${r.status} ${r.body.error.message}`);

  // 8) 40402 创作者不存在
  r = await post({ ...baseFields, authorId: 'CR-999' }, { buf: jpg, type: 'image/jpeg', name: 'a.jpg' });
  check('40402 创作者不存在', r.status === 404 && r.body.error.code === 40402, `HTTP ${r.status} ${r.body.error.message}`);

  // 9) 41301 体积超限
  r = await post(baseFields, { buf: bigBuf, type: 'image/jpeg', name: 'big.jpg' });
  check('41301 图片超过 2MB', r.status === 413 && r.body.error.code === 41301, `HTTP ${r.status} ${r.body.error.message}`);

  // 10) 41501 格式不支持
  r = await post(baseFields, { buf: Buffer.from('MZ fake exe'), type: 'application/octet-stream', name: 'virus.exe' });
  check('41501 格式不支持（.exe）', r.status === 415 && r.body.error.code === 41501, `HTTP ${r.status} ${r.body.error.message}`);

  // 11) 42201 文本改名 .jpg
  r = await post(baseFields, { buf: Buffer.from('这不是图片，只是文本'), type: 'image/jpeg', name: 'fake.jpg' });
  check('42201 魔数校验失败（文本改名 .jpg）', r.status === 422 && r.body.error.code === 42201, `HTTP ${r.status} ${r.body.error.message}`);

  // 12) 42202 尺寸超限
  r = await post(baseFields, { buf: pngBig, type: 'image/png', name: 'huge.png' });
  check('42202 长边超过 1600px', r.status === 422 && r.body.error.code === 42202, `HTTP ${r.status} ${r.body.error.message}`);

  // 13) 200 正常新增（草稿）
  r = await post({ ...baseFields, status: 'draft' }, { buf: pngOk, type: 'image/png', name: 'ok.png' });
  const created = r.body && r.body.data;
  const FIELDS = ['id', 'title', 'authorId', 'categoryId', 'categoryName', 'coverImage', 'coverMedium', 'coverThumb', 'description', 'concept', 'materials', 'createdAt', 'uploadedAt', 'status'];
  const missing = created ? FIELDS.filter((f) => !(f in created)) : FIELDS;
  check('200 新增成功且返回 14 字段', r.status === 200 && missing.length === 0, `HTTP ${r.status} 字段数 ${created ? Object.keys(created).length : 0}${missing.length ? ' 缺:' + missing.join(',') : ''}`);
  check('status 默认为 draft（传 draft）', created && created.status === 'draft', created && created.status);

  // 14) 三档落盘
  if (created) {
    const dir = path.join(PATH.worksDir, created.id);
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
    const expect = ['cover-medium.webp', 'cover-original.webp', 'cover-thumb.webp'];
    check('三档文件落盘', JSON.stringify(files) === JSON.stringify(expect), files.join(' / '));

    const thumbMeta = await sharp(path.join(dir, 'cover-thumb.webp')).metadata();
    const medMeta = await sharp(path.join(dir, 'cover-medium.webp')).metadata();
    check('缩略图长边 480 / 中图 1200', thumbMeta.width === 480 && medMeta.width === 1200, `thumb ${thumbMeta.width}px, medium ${medMeta.width}px`);
    check('三档均为 WebP', thumbMeta.format === 'webp' && medMeta.format === 'webp', thumbMeta.format);

    const imgRes = await fetch(`${BASE}${created.coverMedium}`);
    check('中图可通过静态地址访问', imgRes.status === 200, `HTTP ${imgRes.status} ${created.coverMedium}`);

    // 15) 图片地址命名约定
    check('coverImage 指向 original 档', /cover-original\.webp$/.test(created.coverImage), created.coverImage);
  }

  // 16) 200 正常新增（直接发布）
  r = await post({ ...baseFields, title: '测试作品 · 直接发布', status: 'published' }, { buf: jpg, type: 'image/jpeg', name: 'p.jpg' });
  check('200 直接发布', r.status === 200 && r.body.data.status === 'published', `HTTP ${r.status} status=${r.body.data && r.body.data.status}`);

  // 17) 非法 status
  r = await post({ ...baseFields, status: 'archived' }, { buf: jpg, type: 'image/jpeg', name: 'x.jpg' });
  check('40001 status 非法值被拒', r.status === 400 && r.body.error.code === 40001, `HTTP ${r.status} ${r.body.error.message}`);

  // 18) 非法日期
  r = await post({ ...baseFields, createdAt: '2024-13-40' }, { buf: jpg, type: 'image/jpeg', name: 'd.jpg' });
  check('40001 非法日期被拒', r.status === 400 && r.body.error.code === 40001, `HTTP ${r.status} ${r.body.error.message}`);

  // 19) 退出后 40101
  const lo = await fetch(`${BASE}/api/admin/logout`, { method: 'POST', headers: { cookie } });
  const afterLogout = await post(baseFields, { buf: jpg, type: 'image/jpeg', name: 'a.jpg' });
  check('退出后调用接口返回 40101', lo.status === 200 && afterLogout.status === 401 && afterLogout.body.error.code === 40101,
    `logout ${lo.status} / 之后 ${afterLogout.status}`);

  // 汇总
  const failed = results.filter((x) => !x.pass);
  console.log('\n=== 汇总 ===');
  console.log(`用例 ${results.length} 条，通过 ${results.length - failed.length}，失败 ${failed.length}`);
  if (failed.length) failed.forEach((f) => console.log('  失败：' + f.name + ' → ' + f.detail));

  server.close();
  setTimeout(() => process.exit(failed.length ? 1 : 0), 200);
})();
