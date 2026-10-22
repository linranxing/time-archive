/**
 * BE-08 数据访问模块
 * 全站唯一的数据读写出口：node:sqlite（Node 22 内置，免原生编译）+ 参数化 SQL
 * 表结构对齐《技术方案》§四：categories / creators / works / admins 四张表
 * 注意：子任务 A 不引入 users 表（边界 N05 / CR-01 仍待审批）
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const { PATH } = require('../config/constants');

fs.mkdirSync(PATH.data, { recursive: true });

const db = new DatabaseSync(PATH.dbFile);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sortOrder   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS creators (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  avatar       TEXT NOT NULL DEFAULT '',
  introduction TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS works (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  authorId    TEXT NOT NULL,
  categoryId  TEXT NOT NULL,
  coverImage  TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  concept     TEXT NOT NULL DEFAULT '',
  materials   TEXT NOT NULL DEFAULT '',
  createdAt   TEXT,
  uploadedAt  TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft',
  FOREIGN KEY (authorId)   REFERENCES creators(id),
  FOREIGN KEY (categoryId) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS admins (
  id           TEXT PRIMARY KEY,
  username     TEXT NOT NULL UNIQUE,
  passwordHash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_works_status ON works(status);
CREATE INDEX IF NOT EXISTS idx_works_category ON works(categoryId);
`);

/* ---------------- 密码哈希（scrypt，免原生依赖，等价 bcrypt 用途） ---------------- */
function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${key}`;
}

function verifyPassword(plain, stored) {
  const [salt, key] = String(stored).split(':');
  if (!salt || !key) return false;
  const calc = crypto.scryptSync(plain, salt, 64);
  const expect = Buffer.from(key, 'hex');
  if (calc.length !== expect.length) return false;
  return crypto.timingSafeEqual(calc, expect);
}

/* ---------------- 种子数据（首次启动写入一次） ---------------- */
function seedIfEmpty() {
  const catCount = db.prepare('SELECT COUNT(*) AS n FROM categories').get().n;
  if (catCount === 0) {
    const stmt = db.prepare('INSERT INTO categories (id,name,description,sortOrder) VALUES (?,?,?,?)');
    [
      ['ARCHIVE-001', '绘画档案', '插画、绘画、数字绘画', 1],
      ['ARCHIVE-002', '设计档案', '海报、视觉设计、品牌设计', 2],
      ['ARCHIVE-003', '数字档案', '数字艺术、动态视觉作品', 3],
      ['ARCHIVE-004', '创意造物', '手工艺品、文创产品设计', 4],
    ].forEach((r) => stmt.run(...r));
  }

  const creatorCount = db.prepare('SELECT COUNT(*) AS n FROM creators').get().n;
  if (creatorCount === 0) {
    const stmt = db.prepare('INSERT INTO creators (id,name,avatar,introduction) VALUES (?,?,?,?)');
    [
      ['CR-001', '周叙', '', '纸本与数字混合媒介创作者，关注城市记忆。'],
      ['CR-002', '林见白', '', '视觉设计方向，偏好冷色调与几何构成。'],
      ['CR-003', '许照', '', '手工艺创作者，作品以旧物再造为主。'],
    ].forEach((r) => stmt.run(...r));
  }

  const workCount = db.prepare('SELECT COUNT(*) AS n FROM works').get().n;
  if (workCount === 0) {
    const stmt = db.prepare(
      'INSERT INTO works (id,title,authorId,categoryId,coverImage,description,concept,materials,createdAt,uploadedAt,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
    );
    const now = new Date().toISOString();
    const rows = [
      ['WK-0001', '旧城二十四时', 'CR-001', 'ARCHIVE-001', '', '把老城一天里最安静的瞬间压进长卷。', '时间在同一空间里的叠加。', '纸本设色', '2023-06-01', now, 'published'],
      ['WK-0002', '星图残页', 'CR-002', 'ARCHIVE-002', '', '一组以星图为骨架的海报。', '寻找秩序感。', '数码印刷', '2023-09-12', now, 'published'],
      ['WK-0003', '折叠的走廊', 'CR-001', 'ARCHIVE-003', '', '数字合成的空间实验。', '空间的折叠与回声。', '数字合成', '2023-11-03', now, 'published'],
      ['WK-0004', '旧物时间轴', 'CR-003', 'ARCHIVE-004', '', '旧木料再造的挂件。', '让旧物继续走时间。', '旧木、铜件', '2024-01-20', now, 'published'],
      ['WK-0005', '光的刻度', 'CR-002', 'ARCHIVE-002', '', '以刻度为母题的海报组。', '光也是可以计量的。', '数码印刷', '2024-03-08', now, 'published'],
      ['WK-0006', '纸上星轨', 'CR-001', 'ARCHIVE-001', '', '手绘星轨长卷。', '缓慢的记录。', '纸本、银粉', '2024-05-16', now, 'published'],
      ['WK-0007', '未署名的稿', 'CR-003', 'ARCHIVE-004', '', '尚未完成的草稿。', '留白也是内容。', '综合材料', '2024-06-02', now, 'draft'],
      ['WK-0008', '旧展海报', 'CR-002', 'ARCHIVE-002', '', '一次已结束展览的海报。', '归档即告别。', '数码印刷', '2022-12-24', now, 'archived'],
    ];
    rows.forEach((r) => stmt.run(...r));
    // 种子作品补上封面路径（演示占位图由 scripts/seed-covers.js 生成）
    db.exec(
      "UPDATE works SET coverImage = '/uploads/works/' || id || '/cover-original.webp' WHERE coverImage = ''"
    );
  }

  const adminCount = db.prepare('SELECT COUNT(*) AS n FROM admins').get().n;
  if (adminCount === 0) {
    db.prepare('INSERT INTO admins (id,username,passwordHash) VALUES (?,?,?)').run(
      'AD-001', 'admin', hashPassword('admin12345')
    );
  }
}

seedIfEmpty();

/* ---------------- 通用读写封装（参数化，禁止字符串拼接 SQL） ---------------- */
const q = {
  get: (sql, ...p) => db.prepare(sql).get(...p),
  all: (sql, ...p) => db.prepare(sql).all(...p),
  run: (sql, ...p) => db.prepare(sql).run(...p),
};

function transaction(fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) { /* ignore */ }
    throw e;
  }
}

module.exports = { db, q, transaction, hashPassword, verifyPassword, DB_FILE: PATH.dbFile };
