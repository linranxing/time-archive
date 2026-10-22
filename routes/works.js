/**
 * 接口二 / 接口三：前台公开读接口（子任务 B / C）
 *   GET /api/works      获取分类作品列表（支持 cat / q / sort / page）
 *   GET /api/works/:id  获取单条作品详情
 * 公开接口，无需登录；只读，不产生任何写入
 */
const router = require('express').Router();
const { validateListQuery, validateWorkId } = require('../modules/BE-01/query.validate');
const { listWorks, getWorkDetail } = require('../modules/BE-03/work.query.service');
const { ok } = require('../middlewares/error');

router.get('/api/works', (req, res, next) => {
  try {
    const params = validateListQuery(req.query);
    ok(res, listWorks(params));
  } catch (e) {
    next(e);
  }
});

router.get('/api/works/:id', (req, res, next) => {
  try {
    const id = validateWorkId(req.params.id);
    ok(res, getWorkDetail(id));
  } catch (e) {
    next(e);
  }
});

module.exports = router;
