/**
 * BE-09 公共支撑 · 业务错误码表
 * 依据《交付物2-标准化API接口文档》§7.2 业务错误码总表（19 条）
 * 约定：HTTP 状态码只承载传输语义，业务含义一律由 error.code 表达
 */

const ERRORS = {
  // 请求与参数域 40xxx
  40001: { http: 400, message: '参数缺失或格式非法' },
  40002: { http: 400, message: '字段长度超限' },
  40003: { http: 400, message: '分类编号不存在' },
  40004: { http: 400, message: '分页参数越界' },
  40005: { http: 400, message: '排序方式不支持' },
  40006: { http: 400, message: '删除操作缺少二次确认' },
  // 鉴权与会话域 41xxx
  40101: { http: 401, message: '未登录或会话已失效' },
  40102: { http: 401, message: '账号或密码错误' },
  // 资源不存在域 42xxx
  40401: { http: 404, message: '作品不存在' },
  40402: { http: 404, message: '创作者不存在' },
  // 可见性与状态域 43xxx
  40301: { http: 403, message: '作品未公开' },
  40901: { http: 409, message: '作品状态流转非法' },
  // 图片资源域 44xxx
  41301: { http: 413, message: '图片体积超限' },
  41501: { http: 415, message: '图片格式不支持' },
  42201: { http: 422, message: '图片已损坏或无法解析' },
  42202: { http: 422, message: '图片尺寸超限' },
  // 服务端处理域 50xxx
  50001: { http: 500, message: '图片处理失败' },
  50002: { http: 500, message: '数据写入失败' },
  50003: { http: 500, message: '作品已删除但图片目录清理失败' },
};

/** 业务异常：抛出后由 errorHandler 统一转成 { ok:false, error:{code,message} } */
class AppError extends Error {
  constructor(code, message) {
    const meta = ERRORS[code] || ERRORS[50002];
    super(message || meta.message);
    this.code = code;
    this.http = meta.http;
    this.isAppError = true;
  }
}

module.exports = { ERRORS, AppError };
