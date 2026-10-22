/** 调试：为什么 blob 预览失败 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9223;
const OUT = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const imgPath = path.join(OUT, 'e2e-cover.jpg');
  const profile = path.join(OUT, 'edge-profile-debug');
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`, '--window-size=1400,1600',
    'http://127.0.0.1:3000/admin/login'], { stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 40; i++) {
    await sleep(300);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find((t) => t.type === 'page' && t.url.includes('/admin/login'));
      if (target) break;
    } catch (_) {}
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let seq = 0; const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  });
  await new Promise((r) => ws.addEventListener('open', r));
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id, method, params })); });
  const evalJs = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) return 'EXC: ' + r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception || {}).description;
    return r.result.value;
  };

  await send('Runtime.enable'); await send('DOM.enable'); await send('Page.enable');
  await evalJs(`document.getElementById('username').value='admin';document.getElementById('password').value='admin12345';document.querySelector('form[action="/admin/login"]').submit();`);
  await sleep(1000);
  await send('Page.navigate', { url: 'http://127.0.0.1:3000/admin/upload' });
  await sleep(900);

  // blob 基本能力
  console.log('blob 基本测试:', await evalJs(`
    new Promise(function(res){
      var b = new Blob(['hello'], {type:'text/plain'});
      var u = URL.createObjectURL(b);
      var im = new Image();
      im.onload = function(){ res('blob-img OK ' + u.slice(0,30)); };
      im.onerror = function(){ res('blob-img ERROR ' + u.slice(0,30)); };
      im.src = u;
      setTimeout(function(){ res('blob-img TIMEOUT ' + u.slice(0,30)); }, 1500);
    })
  `));

  const doc = await send('DOM.getDocument', { depth: -1 });
  const q = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#coverImage' });
  await send('DOM.setFileInputFiles', { nodeId: q.nodeId, files: [imgPath] });
  await sleep(500);

  console.log('文件信息:', await evalJs(`
    (function(){ var f = document.getElementById('coverImage').files[0];
      return f ? (f.name + ' | ' + f.size + ' | ' + f.type) : 'no file'; })()
  `));

  console.log('change 监听后状态:', await evalJs(`
    (function(){ var f = document.getElementById('coverImage').files[0];
      var el = document.getElementById('previewImg');
      return JSON.stringify({ src: (el.src||'').slice(0,40), hidden: el.hidden, complete: el.complete, nw: el.naturalWidth }); })()
  `));

  console.log('手动 acceptFile 后:', await evalJs(`
    new Promise(function(res){
      try {
        var f = document.getElementById('coverImage').files[0];
        var u = URL.createObjectURL(f);
        var im = new Image();
        im.onload = function(){ res('OK nw=' + im.naturalWidth + ' url=' + u.slice(0,30)); };
        im.onerror = function(){ res('ERROR url=' + u.slice(0,30)); };
        im.src = u;
        setTimeout(function(){ res('TIMEOUT complete=' + im.complete); }, 2000);
      } catch (e) { res('EXC ' + e.message); }
    })
  `));

  console.log('页面错误日志:', await evalJs(`window.__errs ? window.__errs.join(' | ') : 'none'`));

  ws.close(); edge.kill();
})();
