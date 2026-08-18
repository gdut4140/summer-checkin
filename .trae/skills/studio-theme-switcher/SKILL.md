---
name: "studio-theme-switcher"
description: "切换文档编辑器主题、背景图与配色，并替换硬编码颜色为 CSS 变量。Invoke when user asks to change editor theme/background/color, add a new theme preset, fix color inconsistencies, or refactor hardcoded hex colors to theme variables."
---

# Studio Theme Switcher

用于 `summer-checkin` 项目中文档编辑器（MarkdownStudio）的主题切换、背景图切换、配色调整，以及全局 UI 中硬编码颜色的主题化重构。

## 架构概览

主题系统采用 **三层抽象**：

1. **预设套餐层**（`use-studio-theme.ts`）：6 个预设组合，每个绑定 主题色 + 背景图，不可拆分
2. **CSS 变量层**（`studio-theme.css`）：3 个主题作用域 `.studio-theme-{dark|light|khaki}` 定义 90+ 语义变量
3. **组件消费层**：组件通过 `text-foreground` / `bg-primary` 等 Tailwind 类消费，不读硬编码

### 6 个预设套餐

| 预设 | 主题 | 背景 | 标签 |
|------|------|------|------|
| `dark-rain` | dark | video `/rain.mp4` | 深夜雨 |
| `light-snow` | light | image `/snow.png` | 雪日 |
| `khaki-cloud` | khaki | image `/cloud.png` | 暖云 |
| `dark-pure` | dark | none | 暗色 |
| `light-pure` | light | none | 亮色 |
| `khaki-pure` | khaki | none | 卡其 |

## 关键文件

| 文件 | 职责 |
|------|------|
| `src/components/studio/use-studio-theme.ts` | 预设映射、状态管理、localStorage 持久化（key: `studio-theme:v2`） |
| `src/styles/studio-theme.css` | 3 主题作用域、背景层、面板遮罩、滚动条、代码块、hljs 变量 |
| `src/components/studio/markdown-studio.tsx` | 工具条 UI、背景层渲染、主题注入 |
| `src/components/studio/editor-pane.tsx` | 阅读/编辑面板，绑定 CSS 变量 |
| `src/components/ai/message-bubble.tsx` | AI/用户气泡，按主题切换样式 |
| `src/app/globals.css` | 全局 Scene 主题变量（`html[data-scene]`） |
| `src/config/theme.ts` | SceneType 元数据、新增场景配置 |

## 核心操作指南

### 1. 切换/新增主题预设

修改 [use-studio-theme.ts](file:///d:/项目/summer-checkin/src/components/studio/use-studio-theme.ts)：

```typescript
export type StudioPreset = "dark-rain" | "light-snow" | /* 新增项 */ ;
export type StudioTheme = "dark" | "light" | "khaki" /* | 新主题 */;

const PRESET_MAP: Record<StudioPreset, PresetConfig> = {
  "dark-rain": { theme: "dark", bgType: "video", bgSrc: "/rain.mp4", label: "深夜雨", hasBg: true },
  // 新增：{ theme: "新主题", bgType: "image", bgSrc: "/新图.png", label: "新标签", hasBg: true }
};
```

### 2. 调整主题配色

修改 [studio-theme.css](file:///d:/项目/summer-checkin/src/styles/studio-theme.css) 对应作用域的 CSS 变量：

```css
.studio-theme-khaki.studio-root {
  --studio-base: #d6be98;        /* 卡其主色 */
  --studio-text: #8a6f4a;        /* 正文 */
  --studio-heading: #7a5e3e;     /* 标题 */
  --studio-code-bg: #e2d9c2;     /* 代码块底色 */
  --hljs-keyword: #8a5a1f;      /* 语法关键字 */
}
```

**调色经验法则**：
- 卡其色调亮度的最小步进是 HSL Lightness +3-5%
- 标题色需比正文色深 5-10% 保证层级
- 按钮色应等于 AI 气泡背景色（视觉一致）

### 3. 替换硬编码颜色为主题变量

在 React/TSX 组件中查找硬编码 hex，替换为 Tailwind 主题类：

```diff
- <div className="bg-[#d7ef83] text-[#1a3a1a]">
+ <div className="bg-primary text-primary-foreground">
```

```diff
- <div style={{ color: '#554128' }}>
+ <div className="text-foreground">
```

**常见硬编码位置**：
- 3D 场景调色（learning-island.tsx）
- 进度条/打卡点（plans/page.tsx、rainforest-explorer.tsx）
- 焦点室色块（focus-timer.tsx、local-todo-panel.tsx）
- 音量条（ambient-sound.tsx）
- 通知徽章（notification-bell.tsx）

### 4. 自定义代码块配色

在 [studio-theme.css](file:///d:/项目/summer-checkin/src/styles/studio-theme.css) 各主题作用域内覆盖 `--studio-code-*` 与 `--hljs-*`：

```css
.studio-theme-light.studio-root {
  --studio-code-bg: #f2f2f2;          /* 纯灰白，非卡其 */
  --studio-code-text: #1c1e22;
  --hljs-comment: #6a737d;
  --hljs-keyword: #d73a49;
  --hljs-string: #032f62;
}

.studio-theme-khaki.studio-root {
  --studio-code-bg: #e2d9c2;           /* 卡其底 */
  --hljs-keyword: #8a5a1f;             /* 卡其暗棕关键字 */
  --hljs-string: #5a7a4a;              /* 低饱和绿字符串 */
}
```

### 5. 自定义滚动条

每主题在 studio-theme.css 内单独定义（WebKit + Firefox）：

```css
.studio-theme-dark .studio-root,
.studio-theme-dark.studio-root * {
  scrollbar-width: thin;
  scrollbar-color: #3a4050 transparent;
}
.studio-theme-dark .studio-root::-webkit-scrollbar-thumb {
  background: #3a4050;
  border-radius: 4px;
}
```

### 6. AI/用户气泡样式

修改 [message-bubble.tsx](file:///d:/项目/summer-checkin/src/components/ai/message-bubble.tsx) 按主题分支：

- **暗色（dark-pure）**：纯黑底 + 白字 + 15% 透明白边框
- **亮色（light-pure）**：白底黑字 + 阴影代替边框（参考 ChatGPT）
- **卡其（khaki-*）**：`#f5efde` 浅白卡其底 + `#4a3a28` 深棕字 + box-shadow（非 border）

用户气泡右下尖角（`rounded-br-md`），AI 气泡左下尖角（`rounded-bl-md`），其余样式相同。

### 7. 工具栏容器

**禁止**给工具栏容器加外边框。仅用 `bg-foreground/[0.04]` 浅底做视觉分组：

```tsx
<div className="flex items-center gap-1 rounded-full bg-foreground/[0.04] p-1">
  {/* 主题/背景/透明度按钮 */}
</div>
```

## 新增场景（如"海滩"）三步流程

1. **`theme.ts`**：在 `SceneType` 联合类型加 `"beach"`，新增场景配置元数据
2. **`globals.css`**：在 `html[data-scene="beach"]` 作用域下定义 90+ 语义变量
3. **`scene-selector.tsx`**：新增缩略图卡片（h-12 w-20 毛玻璃容器）

组件层**无需改动**——只要 CSS 变量到位，所有 Tailwind 类自动适配。

## 持久化约定

| localStorage key | 内容 | 版本 |
|------------------|------|------|
| `studio-theme:v2` | `{ preset, opacity }` | 当前 |
| `studio-theme:v1` | （已废弃）theme + bg + opacity 三件套 | 旧 |

版本升级时直接换 key，避免兼容旧数据结构。

## 调试验证

1. 切换 6 个预设：文字色/代码块底/滚动条/气泡全部跟随变化，过渡 300ms
2. 透明度滑条 0→100：背景图清晰度渐变，文字始终可读
3. 刷新页面：状态自动恢复
4. 切换全局 Scene（rain/snow/cloud）：编辑器主题不受影响
5. `GetDiagnostics` 返回空（0 报错）
6. 卡其主题下所有标题应使用 `text-foreground` 类继承 `#8a6f4a`

## 禁忌

- 不要在组件层 hardcode 任何 hex 颜色，必须走 CSS 变量
- 不要给工具栏容器加 `border`，只用 `bg-foreground/[0.04]`
- 不要让 AI 气泡和用户气泡除尖角方向外有任何视觉差异
- 不要在 dark-pure 下引入除黑白灰以外的任何颜色
- 不要在 light-pure 代码块使用卡其暖色，必须用纯灰白 `#f2f2f2`
- 不要让全局 Scene（`html[data-scene]`）和编辑器 Studio 主题耦合
