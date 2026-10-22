/**
 * BE-04 分类查询模块（只读）
 * 职责：读取 4 个时间坐标分类，并提供分类标识存在性校验（供 BE-02 复用）
 */
const { q } = require('../../db');

function listCategories() {
  return q.all(
    `SELECT c.id, c.name, c.description, c.sortOrder,
            (SELECT COUNT(*) FROM works w WHERE w.categoryId = c.id AND w.status = 'published') AS workCount
       FROM categories c
      ORDER BY c.sortOrder ASC`
  );
}

function categoryExists(id) {
  return !!q.get('SELECT id FROM categories WHERE id = ?', id);
}

function findCategory(id) {
  return q.get('SELECT id, name FROM categories WHERE id = ?', id);
}

module.exports = { listCategories, categoryExists, findCategory };
