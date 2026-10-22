/**
 * BE-01 参数校验模块（查询侧，子任务 B 新增）
 * 依据《交付物2》§四 接口二 入参（Query）：cat / q / sort / page
 * 与 write 侧 validate.js 分开，避免把「写接口校验」和「读接口校验」混在一个文件里
 */
const { AppError } = require('../../config/errors');

/** ARCHIVE-000 表示全部档案；001~004 为具体分类 */
const CAT_ALL = 'ARCHIVE-000';
const CAT_RE = /^ARCHIVE-00[0-4]$/;
const SORTS = ['latest', 'earliest', 'created', 'name_asc', 'name_desc'];
const Q_MAX = 50;

function single(v, name) {
  if (Array.isArray(v)) {
    throw new AppError(40001, `参数 ${name} 只能传一个值`);
  }
  return v === undefined || v === null ? '' : String(v);
}

/**
 * 校验接口二 Query
 * @returns {{cat:string,q:string,sort:string,page:number}}
 * 错误码：40001 格式非法 / 40002 关键词过长 / 40003 分类不存在 / 40004 页码越界 / 40005 排序不支持
 */
function validateListQuery(raw) {
  const query = raw || {};

  // cat：缺省为「全部档案」
  let cat = single(query.cat, 'cat').trim();
  if (!cat) cat = CAT_ALL;
  if (!CAT_RE.test(cat)) {
    throw new AppError(40003, `分类编号不存在：${cat}`);
  }

  // q：关键词，≤50 字
  const q = single(query.q, 'q').trim();
  if (q.length > Q_MAX) {
    throw new AppError(40002, `检索关键词不得超过 ${Q_MAX} 字`);
  }

  // sort：5 个允许值，默认 latest
  let sort = single(query.sort, 'sort').trim();
  if (!sort) sort = 'latest';
  if (!SORTS.includes(sort)) {
    throw new AppError(40005, `排序方式不支持：${sort}`);
  }

  // page：从 1 开始的正整数
  const rawPage = single(query.page, 'page').trim();
  let page = 1;
  if (rawPage) {
    if (!/^-?\d+$/.test(rawPage)) {
      throw new AppError(40001, '页码必须为整数');
    }
    page = Number(rawPage);
    if (page < 1) {
      // 契约：page 小于 1 归入 40004 分页参数越界（含 0 与负数）
      throw new AppError(40004, '页码不能小于 1');
    }
    if (!Number.isSafeInteger(page)) {
      throw new AppError(40001, '页码超出可处理范围');
    }
  }

  return { cat, q, sort, page };
}

/** 接口三路径参数 id：空值或超长直接判为「作品不存在」 */
function validateWorkId(raw) {
  const id = single(raw, 'id').trim();
  if (!id || id.length > 64) {
    throw new AppError(40401, '作品不存在');
  }
  return id;
}

module.exports = { validateListQuery, validateWorkId, CAT_ALL, SORTS, PAGE_SORTS: SORTS };
