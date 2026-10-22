/**
 * BE-09 公共支撑 · 上传中间件
 * multer 内存存储 + 2MB 限体积；格式白名单不在此判定（统一由 BE-07 用魔数校验 → 41501）
 */
const multer = require('multer');
const { IMAGE } = require('../config/constants');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE.maxBytes, files: 1, fields: 20 },
});

/** 单文件字段名：coverImage（接口一入参） */
const singleCover = upload.single('coverImage');

module.exports = { upload, singleCover };
