/**
 * BE-02 作品管理模块（全站唯一作品写入口）
 * 本任务只实现「新增作品」；编辑 / 状态流转 / 删除属于后续任务，不在此实现
 * 数据约定（技术方案 §二.5）：库里只存 original 地址，medium / thumb 由命名约定推导，不额外加字段
 */
const crypto = require('crypto');
const { q, transaction } = require('../../db');
const { AppError } = require('../../config/errors');
const { categoryExists, findCategory } = require('../BE-04/category.service');
const { creatorExists } = require('../BE-05/creator.service');
const { removeWorkDir } = require('../BE-07/image.service');

/** 档案编号：WK-YYYYMMDD-XXXX（系统生成，不可变） */
function newWorkId() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `WK-${ymd}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

/** 管理端返回体：契约 §三 返回参数 14 项 */
function shape(row) {
  const id = row.id;
  return {
    id,
    title: row.title,
    authorId: row.authorId,
    categoryId: row.categoryId,
    categoryName: row.categoryName || '',
    coverImage: row.coverImage,
    coverMedium: `/uploads/works/${id}/cover-medium.webp`,
    coverThumb: `/uploads/works/${id}/cover-thumb.webp`,
    description: row.description || '',
    concept: row.concept || '',
    materials: row.materials || '',
    createdAt: row.createdAt || null,
    uploadedAt: row.uploadedAt,
    status: row.status,
  };
}

/**
 * 存在性预检（40003 / 40402）—— 放在图片处理之前，避免无谓的图片计算
 */
function assertRefs(fields) {
  if (!categoryExists(fields.categoryId)) {
    throw new AppError(40003, `分类编号不存在：${fields.categoryId}`);
  }
  if (!creatorExists(fields.authorId)) {
    throw new AppError(40402, '创作者不存在');
  }
}

/**
 * 新增作品
 * @param {object} fields 已校验的文本字段（BE-01 产出）
 * @param {{coverImage:string}} images 已落盘的图片地址（original）
 * @param {string} [id] 由路由先分配，便于图片目录与档案编号保持一致
 */
async function createWork(fields, images, id) {
  assertRefs(fields);

  const workId = id || newWorkId();
  const uploadedAt = new Date().toISOString();

  try {
    transaction(() => {
      q.run(
        `INSERT INTO works
           (id,title,authorId,categoryId,coverImage,description,concept,materials,createdAt,uploadedAt,status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        workId,
        fields.title,
        fields.authorId,
        fields.categoryId,
        images.coverImage,
        fields.description,
        fields.concept,
        fields.materials,
        fields.createdAt || null,
        uploadedAt,
        fields.status
      );
    });
  } catch (e) {
    // 写库失败：清理已落盘的图片目录，避免留下孤儿文件
    await removeWorkDir(workId);
    throw new AppError(50002, '作品保存失败，请稍后重试');
  }

  const row = q.get(
    `SELECT w.id, w.title, w.authorId, w.categoryId, w.coverImage, w.description,
            w.concept, w.materials, w.createdAt, w.uploadedAt, w.status,
            c.name AS categoryName
       FROM works w LEFT JOIN categories c ON c.id = w.categoryId
      WHERE w.id = ?`,
    workId
  );
  return shape(row);
}

module.exports = { createWork, assertRefs, newWorkId, shape, findCategory };
