/**
 * 前台页面路由（子任务 B / C）
 *   GET /            画廊首页（Hero + 全部作品首屏）
 *   GET /works       分类作品列表 / 检索结果（分页）
 *   GET /works/:id   作品详情
 * 页面与接口共用同一套 BE-01 校验与 BE-03 查询，保证「页面看到的」与「接口返回的」同源
 */
const router = require('express').Router();
const { validateListQuery, validateWorkId } = require('../modules/BE-01/query.validate');
const { listWorks, getWorkDetail, stats } = require('../modules/BE-03/work.query.service');
const { listCategories } = require('../modules/BE-04/category.service');

const SORT_OPTIONS = [
  { value: 'latest', label: '最新发布' },
  { value: 'earliest', label: '最早上传' },
  { value: 'created', label: '创作时间' },
  { value: 'name_asc', label: '名称 A→Z' },
  { value: 'name_desc', label: '名称 Z→A' },
];

/** 分页条只展示当前页附近最多 5 个页码 */
function pageWindow(page, totalPages) {
  if (!totalPages) return { from: 0, to: -1 };
  const span = 5;
  let from = Math.max(1, page - Math.floor(span / 2));
  let to = Math.min(totalPages, from + span - 1);
  from = Math.max(1, to - span + 1);
  return { from, to };
}

/** 拼回带当前筛选条件的链接（只允许契约内的三个参数） */
function makeBuildUrl(current) {
  return function buildUrl(patch) {
    const next = {
      cat: patch.cat !== undefined ? patch.cat : current.cat,
      q: patch.q !== undefined ? patch.q : current.q,
      sort: patch.sort !== undefined ? patch.sort : current.sort,
      page: patch.page !== undefined ? patch.page : current.page,
    };
    const usp = new URLSearchParams();
    if (next.cat && next.cat !== 'ARCHIVE-000') usp.set('cat', next.cat);
    if (next.q) usp.set('q', next.q);
    if (next.sort && next.sort !== 'latest') usp.set('sort', next.sort);
    if (next.page && next.page > 1) usp.set('page', String(next.page));
    const qs = usp.toString();
    return qs ? `/works?${qs}` : '/works';
  };
}

function renderError(res, admin, err, backHref, backText) {
  const code = err.code || 50002;
  return res.status(err.http || 500).render('error', {
    admin: admin || null,
    code,
    title: code === 40401 ? '没有找到这件作品' : code === 40301 ? '这件作品尚未公开' : '页面暂时无法显示',
    message: err.message || '请稍后重试。',
    backHref: backHref || '/works',
    backText: backText || '返回画廊',
  });
}

function renderGallery(req, res, next, isHome) {
  try {
    const params = validateListQuery(req.query);
    const result = listWorks(params);
    const categories = listCategories();
    const activeCategory = categories.find((c) => c.id === params.cat) || null;

    res.render('gallery', {
      admin: req.admin || null,
      nav: isHome ? 'gallery' : 'works',
      isHome,
      q: params.q,
      cat: params.cat,
      sort: params.sort,
      page: result.page,
      result,
      categories,
      activeCategory,
      sortOptions: SORT_OPTIONS,
      stats: isHome ? stats() : null,
      pageWindow: pageWindow(result.page, result.totalPages),
      buildUrl: makeBuildUrl(params),
    });
  } catch (e) {
    if (e && e.isAppError) {
      renderError(res, req.admin, e, '/works', '回到全部作品');
    } else {
      next(e);
    }
  }
}

router.get('/', (req, res, next) => renderGallery(req, res, next, true));
router.get('/works', (req, res, next) => renderGallery(req, res, next, false));

router.get('/works/:id', (req, res, next) => {
  try {
    const id = validateWorkId(req.params.id);
    const work = getWorkDetail(id);
    const year = (work.createdAt || work.uploadedAt || '').slice(0, 4);
    res.render('detail', { admin: req.admin || null, work, year });
  } catch (e) {
    if (e && e.isAppError) {
      renderError(res, req.admin, e, `/works`, '返回画廊');
    } else {
      next(e);
    }
  }
});

module.exports = router;
