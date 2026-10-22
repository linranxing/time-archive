/**
 * BE-05 创作者查询模块（只读）
 * 职责：读取创作者资料，并提供创作者标识存在性校验（供 BE-02 复用）
 */
const { q } = require('../../db');

function listCreators() {
  return q.all('SELECT id, name, avatar, introduction FROM creators ORDER BY id ASC');
}

function creatorExists(id) {
  return !!q.get('SELECT id FROM creators WHERE id = ?', id);
}

module.exports = { listCreators, creatorExists };
