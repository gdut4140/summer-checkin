/* ============================================================
 * 头像压缩（客户端专用）
 * 上传前在浏览器里压缩，减小存储与带宽 —— 头像最大显示 ~80px，
 * 存 5MB 原图纯属浪费。只允许在浏览器环境 import，绝不 import 服务端代码。
 *
 * GIF 原样透传（保留动画）；png/jpg/webp 走 Canvas 压缩成方形 WEBP。
 * ============================================================ */

export interface CompressedAvatar {
  blob: Blob;
  /** 输出文件扩展名（presign 路由用它签 Content-Type） */
  ext: string;
  /** 输出 MIME（PUT 时必须与签名一致） */
  type: string;
}

const COMPRESS_SIDE = 512; // 居中裁方后的边长；头像最大 80px，512 足够且支持高分屏
const WEBP_QUALITY = 0.82;

export async function compressAvatarImage(file: File): Promise<CompressedAvatar> {
  // GIF：原样透传，保留动画
  if (file.type === "image/gif") {
    return { blob: file, ext: "gif", type: "image/gif" };
  }

  // 解码：imageOrientation: "from-image" 自动应用 EXIF 方向；大图也能高效解码
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    // 居中裁 1:1 方图（头像以圆形/方形展示，裁方最稳），缩到 min(512, 原图短边)
    const size = Math.min(bitmap.width, bitmap.height);
    const side = Math.min(COMPRESS_SIDE, size);
    const sx = (bitmap.width - size) / 2;
    const sy = (bitmap.height - size) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context 不可用");
    ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, side, side);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("图片压缩失败"))),
        "image/webp",
        WEBP_QUALITY
      );
    });

    return { blob, ext: "webp", type: "image/webp" };
  } finally {
    bitmap.close();
  }
}
