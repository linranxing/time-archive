/**
 * 子任务 A+B+C 整体联调（真浏览器 · Edge + CDP）
 * 覆盖课程要求的 6 步流程：
 *   1 管理员打开上传页 → 2 填写并提交 → 3 系统保存成功
 *   4 画廊首页展示该作品 → 5 点击进入正确详情页 → 6 错误参数 / 不存在作品的合理处理
 * 运行：npm run e2e        （脚本自带服务，端口 3200）
 * 产物：docs/screenshots/05~08*.png，以及控制台 PASS/FAIL 清单
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP_PORT = 9333;
const APP_PORT = 3200;
const BASE = `http://127.0.0.1:${APP_PORT}`;
const SHOTS = path.join(__dirname, '..', 'docs', 'screenshots');
const TMP = path.join(__dirname, '..', '.snapshot');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  → ' + detail : ''}`);
};

process.env.PORT = String(APP_PORT);
const app = require('../app');
const { q } = require('../db');
const { PATH } = require('../config/constants');

const TITLE = '联调样本·' + new Date().toISOString().slice(11, 19).replace(/:/g, '');

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.mkdirSync(TMP, { recursive: true });

  const imgPath = path.join(TMP, 'e2e-full-cover.jpg');
  await sharp({ create: { width: 1400, height: 1050, channels: 3, background: { r: 28, g: 52, b: 104 } } })
    .jpeg({ quality: 90 }).toFile(imgPath);

  const server = app.listen(APP_PORT);
  await new Promise((r) => server.once('listening', r));

  const profile = path.join(TMP, 'edge-profile-full');
  // 每次跑都换干净 profile：避免上一轮缓存的 CSS / JS 影响布局判定
  if (fs.existsSync(profile)) fs.rmSync(profile, { recursive: true, force: true });
  const edge = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profile}`,
    '--window-size=1440,1900',
    `${BASE}/admin/login`,
  ], { stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 50; i++) {
    await sleep(300);
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      target = list.find((t) => t.type === 'page' && t.url.includes('/admin/login'));
      if (target) break;
    } catch (_) { /* 等待 */ }
  }
  if (!target) throw new Error('未能获取 CDP 页面目标');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  });
  await new Promise((r) => ws.addEventListener('open', r));

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };

  const go = async (url) => {
    await send('Page.navigate', { url });
    await sleep(1100);
  };

  const shot = async (file) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, file), Buffer.from(r.data, 'base64'));
    console.log('    截图 docs/screenshots/' + file);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');
  // 固定视口，截图尺寸可比对（headless 下 --window-size 不一定生效）
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 1700, deviceScaleFactor: 1, mobile: false,
  });

  try {
    /* ---------- 1 登录并打开上传页 ---------- */
    await evalJs(`
      document.getElementById('username').value = 'admin';
      document.getElementById('password').value = 'admin12345';
      document.querySelector('form[action="/admin/login"]').submit();
    `);
    await sleep(1300);
    check('1 管理员登录后进入上传页', (await evalJs('location.pathname')) === '/admin/upload',
      await evalJs('location.pathname'));
    check('1 上传表单存在且 9 项控件齐全', await evalJs(`
      (function(){
        var need = ['coverImage','title','categoryId','authorId','createdAt','materials','concept','description'];
        return need.every(function(id){ return !!document.getElementById(id); });
      })()
    `), 'coverImage/title/categoryId/authorId/createdAt/materials/concept/description');

    /* ---------- 2 填写并提交（发布） ---------- */
    const doc = await send('DOM.getDocument', { depth: -1 });
    const node = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#coverImage' });
    await send('DOM.setFileInputFiles', { nodeId: node.nodeId, files: [imgPath] });
    await sleep(400);

    await evalJs(`
      (function(){
        function set(id, v){
          var el = document.getElementById(id);
          el.value = v;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        set('title', ${JSON.stringify(TITLE)});
        set('categoryId', 'ARCHIVE-001');
        set('authorId', 'CR-001');
        set('createdAt', '2024-07-01');
        set('materials', '纸本设色 · 120 × 46 cm');
        set('concept', '把一座城一天里最安静的瞬间压进同一张长卷。');
        set('description', 'B/C 联调自动提交的样本作品。');
        return true;
      })()
    `);
    await sleep(500);
    check('2 封面本地预览加载成功', await evalJs(`
      (function(){
        var el = document.getElementById('previewImg');
        var fb = document.getElementById('previewFallback');
        return el.naturalWidth > 0 && fb.hidden === true;
      })()
    `), await evalJs("String(document.getElementById('previewImg').naturalWidth)+'px'"));

    await evalJs(`document.querySelector('button[data-status="published"]').click()`);
    await sleep(2200);

    const boxText = await evalJs(`document.getElementById('errorBox').innerText`);
    check('3 提交返回 200 并给出档案编号', /200/.test(boxText) && /WK-\d{8}-[0-9A-F]{4}/.test(boxText),
      boxText.replace(/\s+/g, ' ').slice(0, 90));
    await shot('05-联调-上传成功.png');

    const workId = (boxText.match(/WK-\d{8}-[0-9A-F]{4}/) || [''])[0];
    check('3 作品已落库且状态为 published', !!workId &&
      (q.get('SELECT status FROM works WHERE id = ?', workId) || {}).status === 'published', workId);

    const tierFiles = ['cover-original.webp', 'cover-medium.webp', 'cover-thumb.webp'];
    check('3 三档图片均已落盘', tierFiles.every((f) => fs.existsSync(path.join(PATH.worksDir, workId, f))),
      tierFiles.join(' / '));

    /* ---------- 4 画廊首页展示 ---------- */
    await go(`${BASE}/`);
    const homeHas = await evalJs(`document.body.innerText.includes(${JSON.stringify(TITLE)})`);
    check('4 画廊首页展示刚发布的作品', homeHas === true, TITLE);
    const homeStats = await evalJs(`Array.prototype.map.call(document.querySelectorAll('.stat .v'), function(e){return e.innerText;}).join('/')`);
    check('4 首页统计取自真实数据（非写死）', /^\d+\/\d+\/4\/\d+$/.test(homeStats), homeStats);
    await shot('06-联调-画廊首页.png');

    /* ---------- 4b 分类列表页 ---------- */
    await go(`${BASE}/works?cat=ARCHIVE-001`);
    const catPage = JSON.parse(await evalJs(`
      (function(){
        var cards = document.querySelectorAll('.card');
        var cats = Array.prototype.map.call(document.querySelectorAll('.card .cat'), function(e){ return e.innerText; });
        return JSON.stringify({ n: cards.length, cats: cats, onChip: (document.querySelector('.chip.on')||{}).innerText || '' });
      })()
    `));
    check('4 分类列表页只出该分类作品且 chip 高亮',
      catPage.n > 0 && catPage.cats.every((c) => c === '绘画档案'), `${catPage.n} 件 / ${catPage.onChip}`);
    await shot('07-联调-分类列表.png');

    /* ---------- 4c 检索定位到该作品 ---------- */
    await go(`${BASE}/works?q=` + encodeURIComponent(TITLE));
    const listed = await evalJs(`document.body.innerText.includes(${JSON.stringify(TITLE)})`);
    check('4 检索关键词命中刚发布的作品', listed === true, TITLE);

    const cardInfo = await evalJs(`
      (function(){
        var a = document.querySelector('a.thumb');
        if (!a) return null;
        var img = a.querySelector('img');
        return JSON.stringify({ href: a.getAttribute('href'), thumb: img && img.getAttribute('src'),
          nw: img && img.naturalWidth, fb: a.querySelector('[data-fallback]') ? a.querySelector('[data-fallback]').hidden : null });
      })()
    `);
    const ci = JSON.parse(cardInfo || '{}');
    check('4 卡片链接指向 /works/:id 且用 thumb 档', ci.href === `/works/${workId}` &&
      /cover-thumb\.webp$/.test(ci.thumb || ''), `${ci.href} ${ci.thumb}`);
    check('4 卡片缩略图真实加载（非占位）', ci.nw > 0 && ci.fb === true, `naturalWidth=${ci.nw}`);

    /* ---------- 5 点击卡片进入详情 ---------- */
    await evalJs(`document.querySelector('a.thumb').click()`);
    await sleep(1300);
    const detailUrl = await evalJs('location.pathname');
    check('5 点击卡片进入对应详情页', detailUrl === `/works/${workId}`, detailUrl);

    const detail = JSON.parse(await evalJs(`
      (function(){
        var img = document.querySelector('.mainimg img');
        return JSON.stringify({
          title: (document.querySelector('.dt-side .h2')||{}).innerText || '',
          author: (document.querySelector('.dt-aname')||{}).innerText || '',
          src: img && img.getAttribute('src'),
          nw: img && img.naturalWidth,
          hasKv: document.querySelectorAll('.kv dt').length,
          rel: document.querySelectorAll('.dt-rel-item').length,
          body: document.body.innerText
        });
      })()
    `));
    check('5 详情页标题 / 创作者正确', detail.title === TITLE && detail.author === '周叙',
      `${detail.title} · ${detail.author}`);
    check('5 详情页大图用 medium 档且加载成功',
      /cover-medium\.webp$/.test(detail.src || '') && detail.nw > 0, `naturalWidth=${detail.nw}`);
    check('5 详情页展示 5 项档案信息与同系列推荐',
      detail.hasKv === 5 && detail.rel <= 4, `dt=${detail.hasKv} related=${detail.rel}`);
    check('5 详情页未出现越界入口（收藏/浏览量/下载）',
      !/浏览量|收藏|分享/.test(detail.body), 'ok');
    await shot('08-联调-作品详情.png');

    // 灯箱（PRD B06 图片网页内预览）
    await evalJs(`document.querySelector('[data-zoom]').click()`);
    await sleep(500);
    const zoomOpen = JSON.parse(await evalJs(`
      (function(){
        var z = document.getElementById('zoomBox');
        var img = z.querySelector('img');
        return JSON.stringify({ hidden: z.hidden, nw: img.naturalWidth, src: img.getAttribute('src') });
      })()
    `));
    check('5 灯箱打开并加载中图', zoomOpen.hidden === false && zoomOpen.nw > 0 &&
      /cover-medium\.webp$/.test(zoomOpen.src || ''), `naturalWidth=${zoomOpen.nw}`);
    await shot('09-联调-图片灯箱.png');
    await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
    await sleep(300);
    check('5 Esc 可关闭灯箱', await evalJs(`document.getElementById('zoomBox').hidden`), 'hidden=true');

    /* ---------- 6 错误处理 ---------- */
    await go(`${BASE}/works/WK-NOT-EXIST`);
    const notFound = await evalJs(`document.body.innerText`);
    check('6 访问不存在的作品 → 404 页面含 40401',
      notFound.includes('40401') && notFound.includes('没有找到这件作品'), 'ok');
    await shot('10-联调-错误页.png');

    await go(`${BASE}/works?cat=ARCHIVE-009`);
    const badCat = await evalJs(`document.body.innerText`);
    check('6 非法分类参数 → 400 页面含 40003', badCat.includes('40003'), 'ok');

    await go(`${BASE}/works?page=abc`);
    check('6 非法页码 → 400 页面含 40001', (await evalJs('document.body.innerText')).includes('40001'), 'ok');

    await go(`${BASE}/works`);
    const apiErr = await evalJs(`
      fetch('/api/works?sort=hottest').then(function(r){ return r.json().then(function(b){
        return JSON.stringify({ status: r.status, code: b.error.code });
      }); })
    `);
    check('6 接口非法排序 → 400 / 40005', apiErr === '{"status":400,"code":40005}', apiErr);

    const api404 = await evalJs(`
      fetch('/api/works/WK-NOT-EXIST').then(function(r){ return r.json().then(function(b){
        return JSON.stringify({ status: r.status, code: b.error.code });
      }); })
    `);
    check('6 接口不存在作品 → 404 / 40401', api404 === '{"status":404,"code":40401}', api404);

    const draft = await evalJs(`
      fetch('/api/works/WK-0007').then(function(r){ return r.json().then(function(b){
        return JSON.stringify({ status: r.status, code: b.error.code });
      }); })
    `);
    check('6 草稿作品对前台不可见 → 403 / 40301', draft === '{"status":403,"code":40301}', draft);

    /* ---------- 收尾：清理本次联调样本 ---------- */
    if (workId) {
      q.run('DELETE FROM works WHERE id = ?', workId);
      const dir = path.join(PATH.worksDir, workId);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
      check('收尾 联调样本已清理（不影响交付数据）',
        !q.get('SELECT id FROM works WHERE id = ?', workId), workId);
    }
  } catch (e) {
    check('联调执行异常', false, e && e.message);
    console.error(e);
  } finally {
    ws.close();
    edge.kill();
    await sleep(300);
    server.close();
    const pass = results.filter((r) => r.pass).length;
    console.log('\n=== 联调汇总 ===');
    console.log(`检查点 ${results.length} 条，通过 ${pass}，失败 ${results.length - pass}`);
    process.exit(pass === results.length ? 0 : 1);
  }
})().catch((e) => {
  console.error('联调失败：', e.message);
  process.exit(1);
});
