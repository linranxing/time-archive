/**
 * 子任务 B / C 验收测试
 *   B：GET /api/works（cat / q / sort / page + 5 个错误码）+ 画廊首页 / 分类列表页
 *   C：GET /api/works/:id（40401 / 40301 / related）+ 作品详情页
 * 运行：npm run test:bc
 * 说明：用例自带 fixture（WK-T01~WK-T15），跑完自动清理，不影响种子数据
 */
process.env.PORT = process.env.PORT || '3101';
const app = require('../app');
const { q } = require('../db');

const PORT = 3101;
const BASE = `http://127.0.0.1:${PORT}`;
const results = [];

function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  → ' + detail : ''}`);
}

async function getJson(pathname) {
  const res = await fetch(BASE + pathname);
  let body = null;
  try {
    body = await res.json();
  } catch (_) {
    body = null;
  }
  return { status: res.status, body };
}

async function getHtml(pathname) {
  const res = await fetch(BASE + pathname);
  const text = await res.text();
  return { status: res.status, text };
}

function insertFixtures() {
  const now = new Date().toISOString();
  const stmt = q.run.bind(q);
  for (let i = 1; i <= 15; i++) {
    const n = String(i).padStart(2, '0');
    const cat = i % 2 === 0 ? 'ARCHIVE-001' : 'ARCHIVE-002';
    const uploadedAt = new Date(Date.now() - i * 3600 * 1000).toISOString();
    stmt(
      `INSERT INTO works (id,title,authorId,categoryId,coverImage,description,concept,materials,createdAt,uploadedAt,status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      `WK-T${n}`,
      `分页样本 ${n}`,
      i % 3 === 0 ? 'CR-002' : 'CR-001',
      cat,
      `/uploads/works/WK-T${n}/cover-original.webp`,
      `简介 ${n}`,
      `理念 ${n}`,
      i === 5 ? '纸本设色' : '综合材料',
      `2024-01-${String((i % 28) + 1).padStart(2, '0')}`,
      uploadedAt,
      'published'
    );
  }
  // 两条不可见数据：draft / archived
  q.run(
    `INSERT INTO works (id,title,authorId,categoryId,coverImage,description,concept,materials,createdAt,uploadedAt,status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    'WK-TD1', '草稿样本', 'CR-001', 'ARCHIVE-001', '', '不外泄', '不外泄', '',
    '2024-02-02', now, 'draft'
  );
  q.run(
    `INSERT INTO works (id,title,authorId,categoryId,coverImage,description,concept,materials,createdAt,uploadedAt,status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    'WK-TA1', '下架样本', 'CR-001', 'ARCHIVE-001', '', '不外泄', '不外泄', '',
    '2024-02-03', now, 'archived'
  );
}

function cleanupFixtures() {
  q.run("DELETE FROM works WHERE id LIKE 'WK-T%'");
}

function publishedCount() {
  return q.get("SELECT COUNT(*) AS n FROM works WHERE status = 'published'").n;
}

(async function main() {
  const server = app.listen(PORT);
  await new Promise((r) => server.once('listening', r));

  try {
    cleanupFixtures();
    insertFixtures();
    const totalPublished = publishedCount();

    /* ================= 子任务 B：GET /api/works ================= */

    let r = await getJson('/api/works');
    check('B 列表接口 200 且结构完整', r.status === 200 && r.body.ok === true &&
      ['total', 'page', 'pageSize', 'totalPages', 'items'].every((k) => k in r.body.data),
      `total=${r.body.data.total} pageSize=${r.body.data.pageSize}`);

    check('B pageSize 固定 12', r.body.data.pageSize === 12, String(r.body.data.pageSize));

    check('B total 等于已发布总数', r.body.data.total === totalPublished,
      `${r.body.data.total} / ${totalPublished}`);

    check('B 首页返回 12 条', r.body.data.items.length === Math.min(12, totalPublished),
      String(r.body.data.items.length));

    const itemKeys = Object.keys(r.body.data.items[0] || {}).sort().join(',');
    check('B items 字段为契约 10 项',
      itemKeys === 'authorId,authorName,categoryId,categoryName,coverMedium,coverThumb,createdAt,id,title,uploadedAt',
      itemKeys);

    check('B 不含原图 coverImage / status',
      !('coverImage' in (r.body.data.items[0] || {})) && !('status' in (r.body.data.items[0] || {})),
      'ok');

    const ids = r.body.data.items.map((x) => x.id);
    check('B 草稿 / 下架不出现在列表',
      !ids.includes('WK-TD1') && !ids.includes('WK-TA1') && !ids.includes('WK-0007') && !ids.includes('WK-0008'),
      ids.slice(0, 3).join(','));

    check('B 未登录也能访问（公开接口）', r.status === 200, 'HTTP ' + r.status);

    // 分类筛选
    r = await getJson('/api/works?cat=ARCHIVE-001');
    const catOk = r.body.data.items.every((x) => x.categoryId === 'ARCHIVE-001');
    check('B cat 筛选生效且 total 一致',
      r.status === 200 && catOk && r.body.data.total ===
        q.get("SELECT COUNT(*) AS n FROM works WHERE status='published' AND categoryId='ARCHIVE-001'").n,
      `total=${r.body.data.total}`);

    // 搜索
    r = await getJson('/api/works?q=' + encodeURIComponent('旧城'));
    check('B q 命中作品名称', r.status === 200 && r.body.data.total >= 1 &&
      r.body.data.items.some((x) => x.title.includes('旧城')), `total=${r.body.data.total}`);

    r = await getJson('/api/works?q=' + encodeURIComponent('周叙'));
    check('B q 命中创作者名称', r.status === 200 && r.body.data.total >= 1 &&
      r.body.data.items.every((x) => x.authorName === '周叙'), `total=${r.body.data.total}`);

    r = await getJson('/api/works?q=' + encodeURIComponent('纸本设色'));
    check('B q 命中创作材料', r.status === 200 && r.body.data.total >= 1, `total=${r.body.data.total}`);

    r = await getJson('/api/works?q=' + encodeURIComponent('绝对不存在的关键词xyz'));
    check('B 无结果返回 total=0 空数组',
      r.status === 200 && r.body.data.total === 0 && r.body.data.items.length === 0, 'total=0');

    // 排序：latest 按上传时间倒序，earliest 正序（同一份数据两个方向）
    const latestItems = (await getJson('/api/works?sort=latest')).body.data.items;
    const earliestItems = (await getJson('/api/works?sort=earliest')).body.data.items;
    const isDesc = latestItems.every((x, i) => i === 0 || latestItems[i - 1].uploadedAt >= x.uploadedAt);
    const isAsc = earliestItems.every((x, i) => i === 0 || earliestItems[i - 1].uploadedAt <= x.uploadedAt);
    check('B sort=latest 倒序 / earliest 正序',
      isDesc && isAsc && latestItems[0].id !== earliestItems[0].id,
      `latest[0]=${latestItems[0].id} earliest[0]=${earliestItems[0].id}`);

    const created = (await getJson('/api/works?sort=created')).body.data.items
      .map((x) => x.createdAt).filter(Boolean);
    const createdSorted = created.every((v, i) => i === 0 || created[i - 1] >= v);
    check('B sort=created 按创作时间倒序', createdSorted, created.slice(0, 3).join(' > '));

    const na = (await getJson('/api/works?sort=name_asc')).body.data.items.map((x) => x.title);
    const nd = (await getJson('/api/works?sort=name_desc')).body.data.items.map((x) => x.title);
    check('B sort=name_asc / name_desc 生效', na[0] !== nd[0], `${na[0]} vs ${nd[0]}`);

    // 分页
    const p1 = (await getJson('/api/works?page=1&sort=name_asc')).body.data;
    const p2 = (await getJson('/api/works?page=2&sort=name_asc')).body.data;
    const overlap = p1.items.filter((x) => p2.items.some((y) => y.id === x.id));
    check('B 分页两页无重复', overlap.length === 0 && p2.page === 2,
      `p1=${p1.items.length} p2=${p2.items.length} total=${p1.total}`);

    check('B totalPages 计算正确',
      p1.totalPages === Math.ceil(p1.total / 12), String(p1.totalPages));

    const beyond = (await getJson('/api/works?page=999')).body.data;
    check('B 超出页码返回空列表而非报错', beyond.items.length === 0, `items=${beyond.items.length}`);

    // 错误码
    r = await getJson('/api/works?cat=ARCHIVE-009');
    check('B 40003 分类编号不存在', r.status === 400 && r.body.error.code === 40003,
      `${r.status} ${r.body.error.code}`);

    r = await getJson('/api/works?sort=hottest');
    check('B 40005 排序方式不支持', r.status === 400 && r.body.error.code === 40005,
      `${r.status} ${r.body.error.code}`);

    r = await getJson('/api/works?page=0');
    check('B 40004 page=0 越界', r.status === 400 && r.body.error.code === 40004,
      `${r.status} ${r.body.error.code}`);

    r = await getJson('/api/works?page=-3');
    check('B 40004 page 为负越界', r.status === 400 && r.body.error.code === 40004,
      `${r.status} ${r.body.error.code}`);

    r = await getJson('/api/works?page=abc');
    check('B 40001 page 非数字', r.status === 400 && r.body.error.code === 40001,
      `${r.status} ${r.body.error.code}`);

    r = await getJson('/api/works?cat=ARCHIVE-001&cat=ARCHIVE-002');
    check('B 40001 参数重复传输被拒', r.status === 400 && r.body.error.code === 40001,
      `${r.status} ${r.body.error.code}`);

    r = await getJson('/api/works?q=' + encodeURIComponent('字'.repeat(51)));
    check('B 40002 关键词超过 50 字', r.status === 400 && r.body.error.code === 40002,
      `${r.status} ${r.body.error.code}`);

    /* ================= 子任务 C：GET /api/works/:id ================= */

    r = await getJson('/api/works/WK-0001');
    const d = r.body.data || {};
    const detailKeys = Object.keys(d).sort().join(',');
    const EXPECT_DETAIL = 'author,categoryId,categoryName,concept,coverMedium,coverThumb,createdAt,description,id,materials,related,title,uploadedAt';
    check('C 详情接口 200 且字段为契约 13 项',
      r.status === 200 && detailKeys === EXPECT_DETAIL, detailKeys);

    check('C 不下发 status / coverImage 原图',
      !('status' in d) && !('coverImage' in d), 'ok');

    check('C author 为 {id,name} 对象',
      d.author && typeof d.author === 'object' && d.author.id === 'CR-001' && d.author.name === '周叙',
      JSON.stringify(d.author));

    check('C related 最多 4 件且不含自身',
      Array.isArray(d.related) && d.related.length <= 4 && !d.related.some((x) => x.id === d.id),
      `related=${(d.related || []).length}`);

    check('C related 与当前作品同分类', (d.related || []).every((x) => {
      const row = q.get('SELECT categoryId FROM works WHERE id = ?', x.id) || {};
      return row.categoryId === d.categoryId;
    }), 'ok');

    check('C related 字段仅 id/title/coverThumb',
      (d.related || []).every((x) => Object.keys(x).sort().join(',') === 'coverThumb,id,title'), 'ok');

    r = await getJson('/api/works/WK-TD1');
    check('C 40301 草稿作品不可见', r.status === 403 && r.body.error.code === 40301,
      `${r.status} ${r.body.error.code}`);

    r = await getJson('/api/works/WK-TA1');
    check('C 40301 下架作品不可见', r.status === 403 && r.body.error.code === 40301,
      `${r.status} ${r.body.error.code}`);

    r = await getJson('/api/works/WK-NOT-EXIST');
    check('C 40401 作品不存在', r.status === 404 && r.body.error.code === 40401,
      `${r.status} ${r.body.error.code}`);

    r = await getJson('/api/works/%20');
    check('C 40401 id 为空白字符', r.status === 404 && r.body.error.code === 40401,
      `${r.status} ${r.body.error.code}`);

    /* ================= 页面（B / C 的前端落地） ================= */

    let h = await getHtml('/');
    check('B 画廊首页 200 且渲染已发布作品',
      h.status === 200 && h.text.includes('旧城二十四时') && h.text.includes('在时间里，收藏每一件作品'),
      'bytes=' + h.text.length);
    check('B 首页不出现草稿标题', !h.text.includes('草稿样本') && !h.text.includes('未署名的稿'), 'ok');
    check('B 首页使用 thumb 档封面',
      h.text.includes('/uploads/works/WK-0001/cover-thumb.webp'), 'ok');

    h = await getHtml('/works?cat=ARCHIVE-001');
    check('B 分类列表页 200 且高亮当前分类',
      h.status === 200 && h.text.includes('绘画档案') && h.text.includes('chip on'), 'bytes=' + h.text.length);

    h = await getHtml('/works?q=' + encodeURIComponent('不存在的词abc'));
    check('B 无结果展示空状态文案',
      h.status === 200 && h.text.includes('未发现符合条件的档案，请尝试其他关键词'), 'ok');

    h = await getHtml('/works?cat=ARCHIVE-009');
    check('B 页面非法分类走 400 错误页', h.status === 400 && h.text.includes('40003'),
      'HTTP ' + h.status);

    h = await getHtml('/works/WK-0001');
    check('C 详情页 200 且含作品信息',
      h.status === 200 && h.text.includes('旧城二十四时') && h.text.includes('周叙') &&
      h.text.includes('cover-medium.webp'), 'bytes=' + h.text.length);
    check('C 详情页无收藏 / 浏览量 / 分享等越界入口',
      !h.text.includes('浏览量') && !h.text.includes('收藏') && !h.text.includes('分享') &&
      !h.text.includes('加入收藏'), 'ok');

    h = await getHtml('/works/WK-NOT-EXIST');
    check('C 不存在作品返回 404 页面', h.status === 404 && h.text.includes('40401'),
      'HTTP ' + h.status);

    h = await getHtml('/works/WK-TD1');
    check('C 草稿作品返回 403 页面', h.status === 403 && h.text.includes('40301'),
      'HTTP ' + h.status);

    // 静态图片可达
    const img = await fetch(BASE + '/uploads/works/WK-0001/cover-thumb.webp');
    check('B 缩略图静态地址可访问',
      img.status === 200 && (img.headers.get('content-type') || '').includes('image/webp'),
      `${img.status} ${img.headers.get('content-type')}`);
  } catch (e) {
    check('测试执行异常', false, e && e.stack ? e.stack.split('\n')[0] : String(e));
    console.error(e);
  } finally {
    cleanupFixtures();
    const pass = results.filter((x) => x.pass).length;
    console.log('\n=== 汇总 ===');
    console.log(`用例 ${results.length} 条，通过 ${pass}，失败 ${results.length - pass}`);
    server.close(() => process.exit(pass === results.length ? 0 : 1));
  }
})();
