/**
 * BE-09 公共支撑 · 统一错误处理
 * 所有失败响应统一为 { ok:false, error:{ code, message } }
 */
const multer = require('multer');
const { AppError, ERRORS } = require('../config/errors');

function errorHandler(err, req, res, _next) {
  // ① 业务异常
  if (err && err.isAppError) {
    return res.status(err.http).json({ ok: false, error: { code: err.code, message: err.message } });
  }

  // ② 上传体积超限 → 41301（multer 在解析阶段就中断）
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const e = ERRORS[41301];
      return res.status(e.http).json({ ok: false, error: { code: 41301, message: '图片超过 2 MB，请压缩后重试' } });
    }
    const e = ERRORS[40001];
    return res.status(e.http).json({ ok: false, error: { code: 40001, message: `上传参数非法：${err.code}` } });
  }

  // ③ 其它未预期异常 → 50002（不把堆栈暴露给前端）
  console.error('[50002]', req.method, req.originalUrl, err && err.message);
  const e = ERRORS[50002];
  return res.status(e.http).json({ ok: false, error: { code: 50002, message: e.message } });
}

/** 成功响应包装 */
function ok(res, data, status = 200) {
  return res.status(status).json({ ok: true, data });
}

module.exports = { errorHandler, ok, AppError };
