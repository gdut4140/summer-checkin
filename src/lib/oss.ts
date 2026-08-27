// ============================================================
// OSS 对象存储 —— 头像 / 壁纸「预签名 PUT 直传」（服务端专用）
//
// 流程：服务器用 AccessKey 给「每次上传」签一个短时 PUT 地址，
//       浏览器把文件直接 PUT 到 OSS，文件字节流不经过服务器。
//
// 注意：只允许在服务端 import（API 路由 / server code）。
//       ali-oss 依赖 Node crypto，绝不要 import 到 "use client" 组件。
// ============================================================

import OSS from "ali-oss";
import crypto from "crypto";

const ACCESS_KEY_ID = process.env.OSS_ACCESS_KEY_ID ?? "";
const ACCESS_KEY_SECRET = process.env.OSS_ACCESS_KEY_SECRET ?? "";
const BUCKET = process.env.OSS_BUCKET ?? "";
const REGION = process.env.OSS_REGION ?? "oss-cn-guangzhou";

export const OSS_PUBLIC_BASE_URL =
  process.env.OSS_PUBLIC_BASE_URL ?? `https://${BUCKET}.${REGION}.aliyuncs.com`;

/** 上传用途 → 对象前缀。新增用途（如壁纸）在此加一行，整套流程即可复用 */
export const OSS_PURPOSES = ["avatars", "wallpapers"] as const;
export type OssPurpose = (typeof OSS_PURPOSES)[number];

/** 允许上传的文件扩展名白名单 */
export const OSS_ALLOWED_EXTS = ["png", "jpg", "jpeg", "webp", "gif"] as const;
export type OssExt = (typeof OSS_ALLOWED_EXTS)[number];

const EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export function isOssConfigured(): boolean {
  return Boolean(ACCESS_KEY_ID && ACCESS_KEY_SECRET && BUCKET);
}

function createOSSClient(): OSS {
  if (!isOssConfigured()) {
    throw new Error("[oss] 缺少 OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET / OSS_BUCKET");
  }
  return new OSS({
    region: REGION,
    accessKeyId: ACCESS_KEY_ID,
    accessKeySecret: ACCESS_KEY_SECRET,
    bucket: BUCKET,
    secure: true,
  });
}

export interface SignedUpload {
  uploadUrl: string;
  key: string;
  publicUrl: string;
}

/**
 * 给一次上传签 PUT 地址。
 * Content-Type 会被纳入签名（ali-oss _signatureForURL 支持），
 * 浏览器 PUT 时必须带上同款 Content-Type 头，否则 OSS 校验签名失败（403）。
 */
export function signUploadUrl(opts: {
  userId: string;
  purpose?: OssPurpose;
  ext: OssExt;
}): SignedUpload {
  const purpose = opts.purpose ?? "avatars";
  const ext = opts.ext.toLowerCase().replace(/^\./, "") as OssExt;
  const mime = EXT_TO_MIME[ext];
  const key = `${purpose}/${opts.userId}/${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${ext}`;
  const client = createOSSClient();
  const uploadUrl = client.signatureUrl(key, {
    method: "PUT",
    expires: 300,
    ...(mime ? { "Content-Type": mime } : {}),
  });
  return { uploadUrl, key, publicUrl: `${OSS_PUBLIC_BASE_URL}/${key}` };
}

/** 校验 URL 是否属于本 bucket 且落在「当前用户」的 avatars 前缀下（防任意 URL 注入） */
export function isOwnedAvatarUrl(url: string, userId: string): boolean {
  return url.startsWith(`${OSS_PUBLIC_BASE_URL}/avatars/${userId}/`);
}

/** 从公开 URL 反解对象 key（用于 HEAD / DELETE） */
function keyFromPublicUrl(url: string): string | null {
  const prefix = `${OSS_PUBLIC_BASE_URL}/`;
  if (!url.startsWith(prefix)) return null;
  return url.slice(prefix.length);
}

/** HEAD 校验对象（存在性 + 大小），防超大文件入库 */
export async function getObjectMeta(url: string): Promise<{ size: number } | null> {
  const key = keyFromPublicUrl(url);
  if (!key) return null;
  try {
    const res = await createOSSClient().head(key);
    // ali-oss head 返回 { meta, res, status }，content-length 在 res.headers
    const length = res?.res?.headers?.["content-length"] ?? res?.meta?.["content-length"];
    return { size: Number(length ?? 0) };
  } catch {
    return null;
  }
}

/** 删除对象（换头像时清理旧图，best-effort） */
export async function deleteObject(url: string): Promise<boolean> {
  const key = keyFromPublicUrl(url);
  if (!key) return false;
  try {
    await createOSSClient().delete(key);
    return true;
  } catch {
    return false;
  }
}
