/* ============================================================
 * 用户头像 —— 统一采用 public/user 目录下的真实图片
 *  · 目录内放了 16 张：1.png ~ 16.png
 *  · 头像的"id"就是序号（"1"..."16"），存到 user.image 字段，选了哪张就写哪张 id
 *  · 未选头像 / 未知 id：按名字 hash 到 1~16 中一张（保证"同一个人永远对应同一张"）
 *  · AI 专属头像：复用序号 1，或按需单独配一张——这里用 IDX_AI = 1 兜底
 * ============================================================ */

export interface UserAvatarPreset {
  /** 存库的 id，就是 public/user 下的文件名编号："1" ~ "12" */
  id: string;
  /** 图片 URL（public 下静态资源，直接 /user/x.ext 引用） */
  src: string;
  /** 文件扩展名，保留给需要按类型特殊处理的场景 */
  ext: "png" | "jpg" | "webp";
}

// ── 与 public/user 目录严格对应，顺序就是展示顺序 ──
export const USER_AVATAR_PRESETS: UserAvatarPreset[] = [
  { id: "1",  src: "/user/1.png",  ext: "png" },
  { id: "2",  src: "/user/2.png",  ext: "png" },
  { id: "3",  src: "/user/3.png",  ext: "png" },
  { id: "4",  src: "/user/4.png",  ext: "png" },
  { id: "5",  src: "/user/5.png",  ext: "png" },
  { id: "6",  src: "/user/6.png",  ext: "png" },
  { id: "7",  src: "/user/7.png",  ext: "png" },
  { id: "8",  src: "/user/8.png",  ext: "png" },
  { id: "9",  src: "/user/9.png",  ext: "png" },
  { id: "10", src: "/user/10.png", ext: "png" },
  { id: "11", src: "/user/11.png", ext: "png" },
  { id: "12", src: "/user/12.png", ext: "png" },
  { id: "13", src: "/user/13.png", ext: "png" },
  { id: "14", src: "/user/14.png", ext: "png" },
  { id: "15", src: "/user/15.png", ext: "png" },
  { id: "16", src: "/user/16.png", ext: "png" },
];

/* 旧代码还在用的 AVATAR_PRESETS / AI_AVATAR 等兼容导出，
   语义和 USER_AVATAR_PRESETS 对齐，改完各组件后可删除。 */
export const AVATAR_PRESETS: UserAvatarPreset[] = USER_AVATAR_PRESETS;

/* AI 智能体（探索雨林 / 漫步雪林 / 云间漫游）用的头像，
   占一张独立 id "ai"，对应 user/1.png 兜底的真实图。
   注：如果用户之后在 public/user 下放 ai.png/ai.jpg 可随时换真图。 */
export const AI_AVATAR_ID = "ai";
export const AI_AVATAR: UserAvatarPreset = {
  id: AI_AVATAR_ID,
  src: "/user/1.png",
  ext: "png",
};

/* 合法 id 白名单（给 API / form validate 用，包含 AI） */
export const VALID_AVATAR_IDS = new Set([
  ...USER_AVATAR_PRESETS.map((p) => p.id),
  AI_AVATAR_ID,
]);

/* ── 工具：按 id 查 preset（找不到返回 undefined） ── */
export function findAvatarPreset(id: string | null | undefined): UserAvatarPreset | undefined {
  if (!id) return undefined;
  if (id === AI_AVATAR_ID) return AI_AVATAR;
  return USER_AVATAR_PRESETS.find((p) => p.id === id);
}

/* ── 给任意"名字"映射到一张默认头像（hash，稳定且按用户分） ──
   · 替换掉旧的「渐变 + 首字母」fallback
   · 同名永远同图，刷新不会跳                           */
export function fallbackAvatar(name: string): { preset: UserAvatarPreset; initial: string } {
  const s = name || "?";
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  const preset = USER_AVATAR_PRESETS[hash % USER_AVATAR_PRESETS.length];
  return {
    preset,
    initial: s.charAt(0).toUpperCase(),
  };
}

/* ── 解析最终要显示的图片 URL：
   优先级  image(合法 preset id → src)
          image(已是 URL: /xxx http(s): data:)
          image(未知 preset id → hash fallback)
          image(null/空) → hash fallback
          ai 强制 → AI_AVATAR ──────────────────────── */
export function resolveAvatarSrc(input: {
  image: string | null | undefined;
  name: string;
  ai?: boolean;
}): { src: string; id: string } {
  const { image, name, ai = false } = input;
  if (ai) return { src: AI_AVATAR.src, id: AI_AVATAR.id };

  if (image) {
    if (image === AI_AVATAR_ID) return { src: AI_AVATAR.src, id: AI_AVATAR.id };
    const preset = findAvatarPreset(image);
    if (preset) return { src: preset.src, id: preset.id };
    // 已经是 http(s): / 开头 或 data: 的图片 URL
    if (/^(https?:|\/|data:)/i.test(image)) return { src: image, id: "url" };
  }

  // 未知/空 → 按名字 hash 回落到 1~12 中一张
  const { preset } = fallbackAvatar(name);
  return { src: preset.src, id: preset.id };
}
