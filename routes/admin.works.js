/**
 * 接口一：POST /api/admin/works
 * 链路：BE-01 参数校验 → BE-04/BE-05 存在性 → BE-07 图片校验与三档派生 → BE-02 写库
 */
const router = require('express').Router();

const { singleCover } = require('../middlewares/upload');
const { requireAdmin } = require('../middlewares/auth');
const { ok } = require('../middlewares/error');
const { validateCreateWork } = require('../modules/BE-01/validate');
const { validateImage, deriveTiers, removeWorkDir } = require('../modules/BE-07/image.service');
const { createWork, assertRefs, newWorkId } = require('../modules/BE-02/work.service');

router.post('/api/admin/works', requireAdmin, singleCover, async (req, res, next) => {
  let allocatedId = null;
  try {
    // ① 文本字段：40001 缺失/格式 → 40002 长度 → 40003 分类编号范围
    const fields = validateCreateWork(req.body, req.file);

    // ② 存在性：40003 分类 / 40402 创作者（先于图片处理，省掉无效计算）
    assertRefs(fields);

    // ③ 图片：41501 格式 / 42201 损坏 / 42202 尺寸（41301 由 multer 拦截）
    await validateImage(req.file);

    // ④ 三档派生 + 原子落盘：50001
    allocatedId = newWorkId();
    const images = await deriveTiers(req.file.buffer, allocatedId);

    // ⑤ 写库：50002（内部会在失败时清理图片目录）
    const work = await createWork(fields, images, allocatedId);

    // 契约只约定 { ok:true, data }，成功统一用 200，便于与接口文档逐条比对
    return ok(res, work, 200);
  } catch (e) {
    if (allocatedId) await removeWorkDir(allocatedId);
    return next(e);
  }
});

module.exports = router;
