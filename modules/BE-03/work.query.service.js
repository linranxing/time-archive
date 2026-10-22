/**
 * BE-03 作品查询模块（只读，子任务 B / C）
 * 依据《交付物2》：接口二「获取分类作品列表」、接口三「获取单条作品详情」
 * 硬约束：
 *   1) 只返回 status = published 的作品（契约 §一(6)、PRD 2.2、边界 N03）
 *   2) 前台不返回 coverImage（original 原图地址），只给 medium / thumb
 *   3) 分页每页固定 12 条，不接受客户端传入 pageSize
 */
const { q } = require('../../db');
const { AppError } = require('../../config/errors');

const PAGE_SIZE = 12;
const RELATED_LIMIT = 4;

/** 排序白名单 → SQL 片段（不接受任何客户端字符串拼接） */
const ORDER_BY = {
  latest: 'w.uploadedAt DESC, w.id DESC',
  earliest: 'w.uploadedAt ASC, w.id ASC',
  created: 'CASE WHEN w.createdAt IS NULL OR w.createdAt = \'\' THEN 1 ELSE 0 END, w.createdAt DESC, w.uploadedAt DESC',
  name_asc: 'w.title COLLATE NOCASE ASC, w.id ASC',
  name_desc: 'w.title COLLATE NOCASE DESC, w.id ASC',
};

const coverMedium = (id) => `/uploads/works/${id}/cover-medium.webp`;
const coverThumb = (id) => `/uploads/works/${id}/cover-thumb.webp`;

/** LIKE 通配符转义，避免用户输入 % _ 变成通配 */
function escapeLike(s) {
  return s.replace(/[\\%_]/g, (m) => '\\' + m);
}

/**
 * 接口二：分类作品列表
 * @param {{cat:string,q:string,sort:string,page:number}} params BE-01 已校验
 */
function listWorks(params) {
  const where = ["w.status = 'published'"];
  const args = [];

  if (params.cat && params.cat !== 'ARCHIVE-000') {
    where.push('w.categoryId = ?');
    args.push(params.cat);
  }

  if (params.q) {
    const like = '%' + escapeLike(params.q) + '%';
    where.push(
      "(w.title LIKE ? ESCAPE '\\' OR cr.name LIKE ? ESCAPE '\\' OR w.description LIKE ? ESCAPE '\\' OR w.materials LIKE ? ESCAPE '\\')"
    );
    args.push(like, like, like, like);
  }

  const whereSql = where.join(' AND ');

  let total;
  let rows;
  try {
    total = q.get(
      `SELECT COUNT(*) AS n
         FROM works w
         LEFT JOIN creators cr ON cr.id = w.authorId
        WHERE ${whereSql}`,
      ...args
    ).n;

    const offset = (params.page - 1) * PAGE_SIZE;
    rows = q.all(
      `SELECT w.id, w.title, w.categoryId, w.authorId, w.uploadedAt, w.createdAt,
              c.name  AS categoryName,
              cr.name AS authorName
         FROM works w
         LEFT JOIN categories c ON c.id = w.categoryId
         LEFT JOIN creators  cr ON cr.id = w.authorId
        WHERE ${whereSql}
        ORDER BY ${ORDER_BY[params.sort] || ORDER_BY.latest}
        LIMIT ? OFFSET ?`,
      ...args,
      PAGE_SIZE,
      offset
    );
  } catch (e) {
    throw new AppError(50002, '数据查询失败，请稍后重试');
  }

  return {
    total,
    page: params.page,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil(total / PAGE_SIZE),
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      categoryId: r.categoryId,
      categoryName: r.categoryName || '',
      authorId: r.authorId,
      authorName: r.authorName || '',
      coverMedium: coverMedium(r.id),
      coverThumb: coverThumb(r.id),
      uploadedAt: r.uploadedAt,
      createdAt: r.createdAt || null,
    })),
  };
}

/**
 * 接口三：单条作品详情
 * 40401 不存在；40301 未公开（draft / archived）
 */
function getWorkDetail(id) {
  let row;
  try {
    row = q.get(
      `SELECT w.id, w.title, w.authorId, w.categoryId, w.description, w.concept, w.materials,
              w.createdAt, w.uploadedAt, w.status,
              c.name  AS categoryName,
              cr.name AS authorName
         FROM works w
         LEFT JOIN categories c ON c.id = w.categoryId
         LEFT JOIN creators  cr ON cr.id = w.authorId
        WHERE w.id = ?`,
      id
    );
  } catch (e) {
    throw new AppError(50002, '数据查询失败，请稍后重试');
  }

  if (!row) {
    throw new AppError(40401, '作品不存在');
  }
  if (row.status !== 'published') {
    throw new AppError(40301, '作品未公开');
  }

  let related = [];
  try {
    related = q.all(
      `SELECT w.id, w.title
         FROM works w
        WHERE w.status = 'published' AND w.categoryId = ? AND w.id <> ?
        ORDER BY w.uploadedAt DESC, w.id DESC
        LIMIT ?`,
      row.categoryId,
      row.id,
      RELATED_LIMIT
    );
  } catch (e) {
    throw new AppError(50002, '数据查询失败，请稍后重试');
  }

  return {
    id: row.id,
    title: row.title,
    categoryId: row.categoryId,
    categoryName: row.categoryName || '',
    author: { id: row.authorId, name: row.authorName || '' },
    coverMedium: coverMedium(row.id),
    coverThumb: coverThumb(row.id),
    description: row.description || '',
    concept: row.concept || '',
    materials: row.materials || '',
    createdAt: row.createdAt || null,
    uploadedAt: row.uploadedAt,
    related: related.map((r) => ({
      id: r.id,
      title: r.title,
      coverThumb: coverThumb(r.id),
    })),
  };
}

/** 首页统计（画廊 Hero 用）：全部为已发布作品的真实统计，不做任何估算 */
function stats() {
  try {
    const total = q.get("SELECT COUNT(*) AS n FROM works WHERE status = 'published'").n;
    const authors = q.get(
      "SELECT COUNT(DISTINCT authorId) AS n FROM works WHERE status = 'published'"
    ).n;
    const categories = q.get('SELECT COUNT(*) AS n FROM categories').n;
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const week = q.get(
      "SELECT COUNT(*) AS n FROM works WHERE status = 'published' AND uploadedAt >= ?",
      since
    ).n;
    return { total, authors, categories, week };
  } catch (e) {
    throw new AppError(50002, '数据查询失败，请稍后重试');
  }
}

module.exports = { listWorks, getWorkDetail, stats, PAGE_SIZE, ORDER_BY };
