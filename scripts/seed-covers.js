/**
 * 种子演示封面生成器（一次性脚本，可重复执行，已存在则跳过）
 * 背景：8 条种子作品最初没有封面，画廊会出现整屏「封面加载失败」占位，不利于联调与截图。
 * 处理：按作品编号生成 3 档抽象几何占位图（不含任何文字，避免字体缺失导致渲染空白），
 *       写入与线上完全一致的目录 public/uploads/works/{id}/cover-{original|medium|thumb}.webp
 * 说明：这是**演示用占位图**，不是真实学生作品图；真实作品由管理员上传后覆盖同目录。
 *
 * 运行：npm run seed:covers
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const WORKS = path.join(ROOT, 'public', 'uploads', 'works');

/** 每件作品一套配色 + 几何参数，靠编号区分，不依赖文字 */
const THEMES = [
  { hue: '#6FD8FF', rot: 0, rings: 3, bars: 5 },
  { hue: '#F2C14E', rot: 12, rings: 4, bars: 7 },
  { hue: '#7CE0B8', rot: -8, rings: 2, bars: 4 },
  { hue: '#9DB4D0', rot: 20, rings: 5, bars: 6 },
  { hue: '#6FD8FF', rot: -14, rings: 3, bars: 8 },
  { hue: '#F2C14E', rot: 6, rings: 2, bars: 5 },
  { hue: '#7CE0B8', rot: 16, rings: 4, bars: 6 },
  { hue: '#9DB4D0', rot: -20, rings: 3, bars: 4 },
];

function svgFor(w, h, t) {
  const cx = w * 0.62;
  const cy = h * 0.44;
  const rings = Array.from({ length: t.rings }, (_, i) => {
    const r = Math.round(Math.min(w, h) * (0.16 + i * 0.11));
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${t.hue}" stroke-opacity="${0.34 - i * 0.06}" stroke-width="1.6"/>`;
  }).join('');
  const bars = Array.from({ length: t.bars }, (_, i) => {
    const y = Math.round(h * (0.14 + i * 0.1));
    const len = Math.round(w * (0.42 - i * 0.03));
    return `<rect x="${Math.round(w * 0.09)}" y="${y}" width="${len}" height="2" fill="${t.hue}" fill-opacity="0.14"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0A1428"/>
      <stop offset="0.55" stop-color="#10233F"/>
      <stop offset="1" stop-color="#050A16"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.62" cy="0.42" r="0.55">
      <stop offset="0" stop-color="${t.hue}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${t.hue}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  <g transform="rotate(${t.rot} ${w / 2} ${h / 2})">${bars}</g>
  ${rings}
  <rect x="1" y="1" width="${w - 2}" height="${h - 2}" fill="none" stroke="${t.hue}" stroke-opacity="0.28" stroke-width="2"/>
  <rect x="${w * 0.09}" y="${h - h * 0.16}" width="${w * 0.12}" height="3" fill="#F2C14E" fill-opacity="0.7"/>
</svg>`;
}

async function main() {
  const { q } = require('../db');
  const rows = q.all('SELECT id, title FROM works ORDER BY id');
  let made = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const { id } = rows[i];
    const dir = path.join(WORKS, id);
    const pairs = [
      ['cover-original.webp', 1600, 1200],
      ['cover-medium.webp', 1200, 900],
      ['cover-thumb.webp', 480, 360],
    ];
    const allExist = pairs.every(([f]) => fs.existsSync(path.join(dir, f)));
    if (allExist) {
      skipped++;
      continue;
    }
    fs.mkdirSync(dir, { recursive: true });
    const theme = THEMES[i % THEMES.length];
    for (const [file, w, h] of pairs) {
      const buf = await sharp(Buffer.from(svgFor(w, h, theme))).webp({ quality: 82 }).toBuffer();
      const target = path.join(dir, file);
      const tmp = target + '.tmp';
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, target);
    }
    made++;
  }
  console.log(`种子封面：新生成 ${made} 件，已存在跳过 ${skipped} 件`);
  console.log('目录：' + WORKS);
}

main().catch((e) => {
  console.error('生成失败：', e.message);
  process.exit(1);
});
