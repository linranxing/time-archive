/**
 * 基础数据接口：分类 / 创作者
 * 仅提供给上传表单的下拉列表使用（接口契约 §六 获取分类列表、获取创作者详情同源数据）
 * 说明：作品列表 / 详情 / 相关推荐属于子任务 B、C，本文件不实现
 */
const router = require('express').Router();
const { listCategories } = require('../modules/BE-04/category.service');
const { listCreators } = require('../modules/BE-05/creator.service');
const { ok } = require('../middlewares/error');

router.get('/api/categories', (_req, res) => ok(res, { items: listCategories() }));

router.get('/api/creators', (_req, res) => ok(res, { items: listCreators() }));

module.exports = router;
