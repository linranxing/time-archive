/**
 * BE-07 图片资源模块
 * 职责：格式/体积/损坏校验、尺寸校验、三档派生生成、原子落盘、失败清理
 * 依据：接口一 41301 / 41501 / 42201 / 42202 / 50001；技术方案 §二.5 图片存储架构
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const sharp = require('sharp');

const { IMAGE, PATH } = require('../../config/constants');
const { AppError } = require('../../config/errors');

/** 魔数嗅探：不信任客户端给的扩展名与 Content-Type */
function sniffFormat(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  // SVG：文本格式，去 BOM 与空白后判定
  const head = buf.toString('utf8', 0, Math.min(buf.length, 1024)).replace(/^\uFEFF/, '').trim();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'svg';
  return null;
}

/**
 * 校验上传图片：体积 → 声明格式 → 魔数/可解码 → 尺寸
 * 错误码分工（对齐接口文档 §7.3）：
 *   41501 = 声明的扩展名/MIME 不在白名单（如 .exe）
 *   42201 = 声明是图片但魔数不符或无法解码（如改过扩展名的文本文件）
 */
async function validateImage(file) {
  if (!file || !file.buffer || !file.buffer.length) {
    throw new AppError(40001, '请上传作品封面图片');
  }
  // 41301 图片体积超限（multer 已挡一次，这里兜底）
  if (file.size > IMAGE.maxBytes) {
    throw new AppError(41301, `图片超过 2 MB，请压缩后重试`);
  }

  // 41501 格式不支持：先看客户端声明的扩展名与 MIME
  const ext = String(file.originalname || '').split('.').pop().toLowerCase();
  const declaredOk = IMAGE.allowed.includes(ext) || IMAGE.allowedMime.includes(file.mimetype);
  if (!declaredOk) {
    throw new AppError(41501, '仅支持 JPG / PNG / SVG / WebP');
  }

  // 42201 已损坏：声明是图片，但魔数对不上
  const format = sniffFormat(file.buffer);
  if (!format) {
    throw new AppError(42201, '图片无法读取，请更换文件');
  }

  // 42201 已损坏：魔数通过但解码失败
  let meta;
  try {
    meta = await sharp(file.buffer, { failOn: 'error' }).metadata();
  } catch (e) {
    throw new AppError(42201, '图片无法读取，请更换文件');
  }
  const width = meta.width || 0;
  const height = meta.height || 0;
  if (!width || !height) {
    // SVG 可能未声明宽高，交由派生阶段按密度处理，不判尺寸
    if (format !== 'svg') throw new AppError(42201, '图片无法读取，请更换文件');
  }

  // 42202 图片尺寸超限（长边 > 1600px）
  const longEdge = Math.max(width, height);
  if (longEdge > IMAGE.maxEdge) {
    throw new AppError(42202, `图片长边超过 ${IMAGE.maxEdge} px，请缩放后再上传`);
  }

  return { format, width, height };
}

/**
 * 生成三档派生并原子落盘
 * 目录：public/uploads/works/{workId}/cover-original|medium|thumb.webp
 * 策略：先全部写入临时文件，全部成功后再逐个 rename；任一失败清理整目录
 */
async function deriveTiers(buffer, workId) {
  const dir = path.join(PATH.worksDir, workId);
  const tmpDir = path.join(dir, '.tmp');
  try {
    await fsp.mkdir(tmpDir, { recursive: true });

    for (const tier of IMAGE.tiers) {
      await sharp(buffer, { failOn: 'error' })
        .rotate() // 按 EXIF 摆正
        .resize({
          width: tier.edge,
          height: tier.edge,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: tier.key === 'thumb' ? 78 : 86 })
        .toFile(path.join(tmpDir, tier.file));
    }

    // 全部成功后再落位（原子重命名）
    for (const tier of IMAGE.tiers) {
      await fsp.rename(path.join(tmpDir, tier.file), path.join(dir, tier.file));
    }
    await fsp.rm(tmpDir, { recursive: true, force: true });
  } catch (e) {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
    throw new AppError(50001, '图片处理失败，请稍后重试');
  }

  const base = `/uploads/works/${workId}`;
  return {
    coverImage: `${base}/${IMAGE.tiers[0].file}`, // original：仅管理端返回
    coverMedium: `${base}/${IMAGE.tiers[1].file}`,
    coverThumb: `${base}/${IMAGE.tiers[2].file}`,
  };
}

/** 删除某作品图片目录（写库失败回滚时调用） */
async function removeWorkDir(workId) {
  await fsp.rm(path.join(PATH.worksDir, workId), { recursive: true, force: true }).catch(() => {});
}

module.exports = { validateImage, deriveTiers, removeWorkDir, sniffFormat };
