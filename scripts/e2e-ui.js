/**
 * 真浏览器端到端验证（CDP）
 * 流程：登录页表单提交 → 打开上传页 → 真实选择文件 → 点「保存草稿」→ 截图
 * 依赖：本机 Edge（--headless）+ 已启动的 http://127.0.0.1:3000
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9222;
const OUT = process.argv[2] || path.join(__dirname, '..', '.snap');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdpTargets() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return r.json();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const imgPath = path.join(OUT, 'e2e-cover.jpg');
  await sharp({ create: { width: 1200, height: 900, channels: 3, background: { r: 24, g: 46, b: 92 } } })
    .jpeg({ quality: 90 }).toFile(imgPath);

  const profile = path.join(OUT, 'edge-profile');
  const edge = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--window-size=1400,1800',
    'http://127.0.0.1:3000/admin/login',
  ], { stdio: 'ignore' });

  // 等页面目标就绪
  let target = null;
  for (let i = 0; i < 40; i++) {
    await sleep(300);
    try {
      const list = await cdpTargets();
      target = list.find((t) => t.type === 'page' && t.url.includes('/admin/login'));
      if (target) break;
    } catch (_) { /* 还没起来 */ }
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
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception || {}).description);
    return r.result.value;
  };

  const shot = async (file) => {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(OUT, file), Buffer.from(r.data, 'base64'));
    console.log('  截图:', file);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  // 1) 登录
  await evalJs(`
    document.getElementById('username').value = 'admin';
    document.getElementById('password').value = 'admin12345';
    document.querySelector('form[action="/admin/login"]').submit();
  `);
  await sleep(1200);
  const url1 = await evalJs('location.href');
  console.log('1) 登录后地址:', url1);

  // 2) 上传页
  await send('Page.navigate', { url: 'http://127.0.0.1:3000/admin/upload' });
  await sleep(1000);
  const hasForm = await evalJs('!!document.getElementById("uploadForm")');
  console.log('2) 上传页表单存在:', hasForm);
  await shot('01-upload-empty.png');

  // 3) 真实设置文件输入
  const doc = await send('DOM.getDocument', { depth: -1 });
  const q = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#coverImage' });
  await send('DOM.setFileInputFiles', { nodeId: q.nodeId, files: [imgPath] });
  await sleep(400);
  await evalJs(`
    (function(){
      document.getElementById('title').value = 'E2E 测试作品';
      document.getElementById('title').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('categoryId').value = 'ARCHIVE-002';
      document.getElementById('categoryId').dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('authorId').value = 'CR-002';
      document.getElementById('authorId').dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('createdAt').value = '2024-04-18';
      document.getElementById('createdAt').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('materials').value = '数码印刷 · 70 × 100 cm';
      document.getElementById('concept').value = '用刻度记录时间的流动。';
      document.getElementById('concept').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('description').value = 'E2E 自动化填写，用于人工初审取证。';
      document.getElementById('description').dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()
  `);
  await sleep(600);
  console.log('   预览状态:', await evalJs(`
    (function(){ var el = document.getElementById('previewImg');
      return JSON.stringify({ src:(el.src||'').slice(0,38), hidden:el.hidden, complete:el.complete, nw:el.naturalWidth,
        fb: document.getElementById('previewFallback').hidden,
        card: { hidden: document.getElementById('cardImg').hidden, nw: document.getElementById('cardImg').naturalWidth } }); })()
  `));
  await shot('02-upload-filled.png');

  // 4) 点击「保存草稿」
  await evalJs(`document.querySelector('button[data-status="draft"]').click()`);
  await sleep(1800);
  const resultText = await evalJs(`document.getElementById('errorBox').innerText`);
  console.log('4) 提交后提示区:\n' + resultText.split('\n').map((s) => '   ' + s).join('\n'));
  await shot('03-upload-success.png');

  // 5) 校验拦截：清空标题再提交
  await evalJs(`
    document.getElementById('title').value = '';
    document.querySelector('button[data-status="published"]').click();
  `);
  await sleep(800);
  const errText = await evalJs(`document.getElementById('errorBox').innerText`);
  console.log('5) 客户端校验拦截:\n' + errText.split('\n').map((s) => '   ' + s).join('\n'));
  await shot('04-client-validation.png');

  ws.close();
  edge.kill();
  await sleep(400);
  console.log('\n端到端验证完成，产物目录:', OUT);
})().catch((e) => {
  console.error('E2E 失败:', e.message);
  process.exit(1);
});
