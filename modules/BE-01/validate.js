/**
 * BE-01 路由与参数校验模块
 * 职责：校验接口一入参（9 项），按契约顺序抛出 40001 / 40002 / 40003
 * 说明：40402（创作者不存在）由 BE-05 存在性校验抛出，在 service 层完成
 */
const { LIMIT, STATUS } = require('../../config/constants');
const { AppError } = require('../../config/errors');

const str = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(s) {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * 校验并归一化「管理员新增作品」入参
 * @param {object} body multipart 文本字段
 * @param {object|undefined} file multer 单文件
 */
function validateCreateWork(body, file) {
  // ① 必填缺失 / 格式非法 → 40001
  if (!file) throw new AppError(40001, '请上传作品封面图片（coverImage 必填）');

  const title = str(body.title);
  const authorId = str(body.authorId);
  const categoryId = str(body.categoryId);
  const description = str(body.description);
  const concept = str(body.concept);
  const materials = str(body.materials);
  const createdAt = str(body.createdAt);
  const status = str(body.status) || 'draft';

  if (!title) throw new AppError(40001, '作品名称不能为空');
  if (!authorId) throw new AppError(40001, '请选择创作者');
  if (!categoryId) throw new AppError(40001, '请选择作品分类');
  if (createdAt && !isValidDate(createdAt)) {
    throw new AppError(40001, '创作时间格式应为 YYYY-MM-DD');
  }
  // 契约：入参 status 仅 draft / published，默认 draft
  if (!['draft', 'published'].includes(status)) {
    throw new AppError(40001, 'status 仅支持 draft 或 published');
  }

  // ② 字段长度超限 → 40002
  if ([...title].length > LIMIT.title) throw new AppError(40002, `作品名称不得超过 ${LIMIT.title} 字`);
  if ([...description].length > LIMIT.description) throw new AppError(40002, `作品简介不得超过 ${LIMIT.description} 字`);
  if ([...concept].length > LIMIT.concept) throw new AppError(40002, `创作理念不得超过 ${LIMIT.concept} 字`);
  if ([...materials].length > LIMIT.materials) throw new AppError(40002, `创作材料不得超过 ${LIMIT.materials} 字`);

  // ③ 分类编号不存在 → 40003（取值范围校验，存在性由 BE-04 再确认）
  if (!/^ARCHIVE-00[1-4]$/.test(categoryId)) {
    throw new AppError(40003, `分类编号不存在：${categoryId}`);
  }

  return { title, authorId, categoryId, description, concept, materials, createdAt, status };
}

module.exports = { validateCreateWork, isValidDate };
