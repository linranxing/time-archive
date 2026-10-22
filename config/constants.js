/** 全局常量：路径、图片规格、枚举值（对齐技术方案与接口契约） */
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const PORT = Number(process.env.PORT || 3000);

const PATH = {
  root: ROOT,
  data: path.join(ROOT, 'data'),
  dbFile: path.join(ROOT, 'data', 'archive.db'),
  uploadsRoot: path.join(ROOT, 'public', 'uploads'),
  worksDir: path.join(ROOT, 'public', 'uploads', 'works'),
};

/** 图片规格：接口一 41301（≤2MB）、42202（长边 ≤1600px）、技术方案 §二.5 三档派生 */
const IMAGE = {
  maxBytes: 2 * 1024 * 1024,
  maxEdge: 1600,
  tiers: [
    { key: 'original', file: 'cover-original.webp', edge: 1600 },
    { key: 'medium', file: 'cover-medium.webp', edge: 1200 },
    { key: 'thumb', file: 'cover-thumb.webp', edge: 480 },
  ],
  // 41501 白名单：JPG / PNG / SVG / WebP
  allowed: ['jpg', 'jpeg', 'png', 'svg', 'webp'],
  allowedMime: ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'],
};

/** 作品状态：draft 草稿 / published 已发布 / archived 已下架（前台仅 published 可见） */
const STATUS = ['draft', 'published', 'archived'];

/** 字段长度上限：接口一 40002 */
const LIMIT = {
  title: 60,
  description: 500,
  concept: 1000,
  materials: 200,
};

/** 会话 */
const SESSION = {
  cookie: 'ta_sid',
  ttlMs: 2 * 60 * 60 * 1000,
};

module.exports = { ROOT, PORT, PATH, IMAGE, STATUS, LIMIT, SESSION };
