// ============================================================
// 场景背景图优化：PNG → WebP（同尺寸重编码，仅换编码器）
//   · 原图 1920×1080 / 1535×1024 PNG 各 ~2MB
//   · WebP quality 72 通常能压到 150–400KB（5~10 倍）
// 用法：node scripts/optimize-backgrounds.mjs（需在装有 sharp 的目录下）
// 转换完可 git rm 掉 public/*.png（原始文件仍在 git 历史里可找回）
// ============================================================
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const PUBLIC = path.resolve(import.meta.dirname, "../public");
const SCENES = ["rain", "snow", "cloud"];

async function main() {
  for (const name of SCENES) {
    const src = path.join(PUBLIC, `${name}.png`);
    const out = path.join(PUBLIC, `${name}.webp`);
    if (!fs.existsSync(src)) {
      console.log(`[skip] ${src} 不存在，跳过`);
      continue;
    }
    const meta = await sharp(src).metadata();
    const info = await sharp(src).webp({ quality: 72, effort: 6 }).toFile(out);
    const origSize = fs.statSync(src).size;
    console.log(
      `${name}.png ${meta.width}x${meta.height} ${(origSize / 1024 / 1024).toFixed(2)}MB` +
        `  →  ${name}.webp ${(info.size / 1024 / 1024).toFixed(2)}MB` +
        `  (${Math.round((1 - info.size / origSize) * 100)}% 减小)`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
