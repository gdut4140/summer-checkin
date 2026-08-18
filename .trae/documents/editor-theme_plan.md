# 文档编辑器：三主题色 + 背景图 + 透明度滑条 实施计划

## Repository Research
1. **编辑形态（3 条进入路径，都是 MarkdownStudio）**：
   - 全屏「文档工作室」路径：`docs/[id]/page.tsx → doc-studio-client.tsx → MarkdownStudio（`components/studio/markdown-studio.tsx`）— 顶栏+三栏（目录/阅读+编辑/AI）
   - 「左右对照」阅读 + textarea 编辑：`components/studio/editor-pane.tsx`（L218 MarkdownRenderer 阅读面板 / L230 textarea 编辑面板，两个面板背景都是透明叠加）
   - 「专注阅读」单栏：`components/studio/milkdown-editor.tsx`（Milkdown/MilkdownProvider）
   - 「知识库上传卡片」：`docs/page.tsx → docs-client.tsx`（不算编辑器本体，背景沿用全局，不用动）

2. **当前样式**：
   - 顶栏（markdown-studio.tsx L311）：`bg-background text-foreground`（完全不透明 + 没加背景图）
   - 主体三栏容器（L460）：无 bg 透明，继承父层 `bg-background`
   - 阅读面板（editor-pane.tsx L217 `studio-read studio-scroll h-full`）+ 编辑 textarea（L236 `bg-transparent`）：完全透明，所以"背景"实际由 markdown-studio.tsx L311 根 div 决定
   - markdown.css 里只有 .hljs 代码块语法高亮色，固定 `#1e1e1e` 暗 + `#569cd6` 蓝关键字，没主题化
   - 现在 public/ 下 **已存在** 3 张背景素材：`rain.mp4`（视频）、`snow.png`、`cloud.png`，可直接复用作为编辑器的三张背景图

3. **当前全局主题系统（不能改）**：
   - `SceneContext` + `html[data-scene="rain|snow|cloud"]` 切换全局 UI 主色（#d7ef83 绿 / #7dd3fc 冰蓝 / #d6be98 奶油卡其）
   - 「深色 / 亮色」另有 Shadcn `dark` class（`ThemeProvider` 管）
   - 编辑器现在自动继承了这些，但**没有编辑器自己独立的"暗色/亮色/卡其"三色切换**（用户这次要的「文档编辑器要支持亮色和暗色和卡其柔和色」是编辑器独立覆盖，不是跟全局 Scene 耦合）

4. **用户需求拆解**：
   - 编辑器顶栏加「主题切换」工具：暗（深色墨底）、亮（米白底）、卡其（奶油米黄 + 低饱和）三个按钮；**与全局场景解耦**
   - 编辑器区域（阅读+编辑面板）加「背景图」：暗 = snow.png / 亮 = cloud.png / 卡其 = cloud.png 但覆盖卡其色叠层（或独立 texture）；同时支持用户手动点切换背景图（rain/snow/cloud 三个按钮），默认与主题建议色对齐，但允许自由组合
   - 透明度滑条：0%（完全不透明，纯色底）→ 100%（完全透出背景图，面板无底色）。默认 30%。编辑面板底色 + 阅读面板底色都会响应（这样文字始终可读）
   - **持久化**：主题、背景图、透明度 3 个值存 `localStorage`（`studio-theme:v1`），下次打开自动恢复
   - 「代码块样式」也要跟主题走：暗 = 现有 `#1e1e1e` / 亮 = `#f5f5f5` + 浅色 hljs 色 / 卡其 = 米色底 + 卡其绿关键词

## Files and Modules（只改编辑器相关 4 + 1 新建 = 共 5 文件）

| 文件 | 改动内容 | 量级 |
| --- | --- | --- |
| `src/components/studio/markdown-studio.tsx` | 1. 顶栏插入 ThemeToolGroup 组件位；2. 根 div 外层加背景层 + 面板遮罩层；3. 通过 CSS 变量把透明度、背景图 URL、主题名注入到 style；4. 引入 `useStudioTheme` hook 管理三件套状态 | 中（+120 行左右） |
| `src/components/studio/use-studio-theme.ts` (新建) | hook：`type StudioTheme = "dark"\|"light"\|"khaki"`；`type StudioBg = "rain"\|"snow"\|"cloud"`；`opacity` 0-100；localStorage 读写（key `studio-theme:v1`）；提供 `{ theme, setTheme, bg, setBg, opacity, setOpacity, rootStyle, editorBgClass }` | 小（约 70 行） |
| `src/app/globals.css`（或新建 `styles/studio-theme.css`，优先新建以保持 globals 干净） | 新增 3 套 `.studio-theme-dark / .studio-theme-light / .studio-theme-khaki` 作用域：.studio-read 文字色（heading/paragraph/link/quote/code 前景）、textarea 编辑前景色、::selection 选择色、面板底色的 CSS 变量 `--studio-surface: rgba(X,X,X,var(--studio-opacity))`，`--studio-bg-img: url(...)`，`--studio-text`，`--studio-muted`，`--studio-code-bg` 等约 12 个变量 | 中（约 150 行） |
| `src/components/studio/editor-pane.tsx` | 1. `.studio-read` 阅读面板容器（L214）`bg-transparent` 改成读 `--studio-surface`（内联 style 或类）；2. 编辑 textarea（L236）`bg-transparent` 改成读 `--studio-surface`；3. className 加上 `studio-theme-scoped`（父层会控制颜色作用域） | 小（约 8 行） |
| `src/styles/markdown.css` | 3 套代码块覆盖：`.studio-theme-light .markdown-body pre.code-block { background-color:#f5f5f5 !important; color:#333 !important}` + 对应的浅色 hljs 关键字色；`.studio-theme-khaki` 米色底 + 卡其色关键词（与 .dark 版本互斥）；行内 code 背景色也按主题变 | 小（约 50 行） |

## Implementation Steps（依赖顺序）

### Step 1: 新建 hook `components/studio/use-studio-theme.ts`
- 定义类型：`StudioTheme = "dark" | "light" | "khaki"`，`StudioBg = "rain" | "snow" | "cloud"`
- 读取 `localStorage` 初始值（SSR 早期返回默认值：`theme = dark`、`bg = cloud`、`opacity = 30`）
- 返回 3 个 `setState` + 一个 `rootCssVars: React.CSSProperties`（把 theme/bg/opacity 翻译成 `--studio-theme`、`--studio-bg-url`、`--studio-opacity` 3 个 CSS 变量，后续 CSS 全靠这三个变量驱动）
- 任意 state 变化 → useEffect 里 `localStorage.setItem('studio-theme:v1', JSON.stringify({theme,bg,opacity}))` 持久化

### Step 2: 新建样式 `styles/studio-theme.css`（再在 `globals.css` L4 `@import` 引入，保持 globals 清晰）
- `.studio-root` 根作用域，负责：
  - 背景图层（`--studio-bg-url` 绝对定位 inset-0 + `object-cover`，rain 场景用 mp4 的话这里走 poster 或用 `<video>` 层，**先统一用 background-image，rain 回退 rain 占位图** 保证无复杂度；需要视频再说）
  - 面板遮罩层：`--studio-surface` = 按 theme 的 base 色 × `var(--studio-opacity)`（面板底色是不透明时压过背景图，透明时让图透）
- `.studio-theme-dark / .studio-theme-light / .studio-theme-khaki` 3 个子作用域分别定义：
  - `--studio-text / --studio-muted / --studio-heading / --studio-link / --studio-code / --studio-code-bg / --studio-quote / --studio-border`
  - 阅读面板 `.studio-read p/h1/h2/a/blockquote/hr/table/th/td/ul/li` 颜色绑定变量
  - 编辑面板 textarea 颜色 + `caret-color`
  - `.markdown-body pre.code-block` + 行内 code 颜色（在 studio scope 下 override 掉 markdown.css 的 `!important`，用更高优先级：`.studio-theme-light.studio-root .markdown-body pre.code-block { ... !important}`）

### Step 3: `markdown-studio.tsx` 整合：状态层 + 工具条 UI
- import `useStudioTheme`，拿 `{ theme, setTheme, bg, setBg, opacity, setOpacity, rootCssVars }`
- 结构改造（L310-311 外层套）：
  ```tsx
  <div className={`studio-root studio-theme-${theme}`} style={rootCssVars}>
    {/* 背景图层（绝对定位，z-0） */}
    <div className="studio-bg-layer" />
    {/* 面板遮罩层：盖在 bg 上面，让文字底可读 */}
    <div className="studio-surface-mask" />
    {/* 现有结构（z-10，position:relative） */}
    <div className="relative z-10 flex h-full flex-col text-foreground"> ... </div>
  </div>
  ```
- 在顶栏居中的「目录 / AI / 专注阅读」按钮组**左侧**（L368 之前）加 ThemeToolGroup：
  - 三主题按钮（🌙 暗 / ☀️ 亮 / 🍪 卡其）：选中态 `bg-primary text-primary-foreground`
  - 三背景图按钮（雨林雨、雪、云）：用 thumbnail（迷你方块 image 预览或图标）+ tooltip
  - **透明度滑条**（<input type="range" min="0" max="100" step="1" />）：滑条左侧「透明度」+ 当前值「30%」数字显示
  - 工具组放在圆角胶囊 border 容器里（和中央 tab 容器视觉风格一致）

### Step 4: `editor-pane.tsx` + `milkdown-editor.tsx` 让编辑/阅读面板吃变量
- 阅读面板（editor-pane.tsx L214-L222）：`.studio-read` 容器的 `bg-transparent` 保持不变，**颜色改由 studio-theme.css 的 `.studio-theme-dark .studio-read p` 等变量驱动**
- Milkdown（milkdown-editor.tsx L163 `<Milkdown/>`）：新增 `style={{ color: 'var(--studio-text)' }}` 到 wrapper；`.ProseMirror` 文字颜色同样在 CSS 中通过 `.studio-theme-X .ProseMirror` 覆盖
- 编辑 textarea（editor-pane.tsx L230-L237）：`className` 里加 `caret-primary` 或 caret 随主题色，color 读 `--studio-text`

### Step 5: `markdown.css` 代码块配色按主题覆盖（比 studio-theme.css 低，不能和 Step 2 冲突）
- 实际上 Step 2 的 studio-theme.css 会写更高优先级的覆盖（`.studio-theme-light.studio-root .markdown-body pre.code-block`），markdown.css 无需改动。**避免改动 markdown.css**，保持代码高亮默认色被编辑器级 scope 盖住就行。

### Step 6: 联调 & 边界
- 顶栏背景（L313 `bg-background`）：改成 `bg-transparent`，让它吃 `--studio-surface`（否则顶栏是全局黑背景挡不住，风格不统一）
- 搜索框/悬浮工具条（editor-pane.tsx L245、L288 `bg-background/95`）：改成 `bg-primary-foreground/[.03] backdrop-blur` 在 light/khaki 下正常，保持现在的也可（不会穿底）
- **移动端**：ThemeToolGroup 在移动端会和中央 tab 抢空间 → 移动端把主题按钮组放在顶栏右上角（和「导出/保存状态」并列），或改成一行放不下时省略为单一按钮，点击弹出下拉面板选主题+背景+透明度（popover）。本计划为了简化：**md 断点以下显示为单个 ⚙️ 按钮（Popover）展开全部选项**，不跟中央 tab 冲突。
- **SSR 安全**：所有读 localStorage 的地方都 `typeof window !== "undefined"` 保护，初始返回默认值
- 背景图 rain.mp4 是 mp4 不能做 background-image → rain 背景改成 `/rain.mp4` 的 poster 或直接用 cloud.png 占位，不在本次 scope（需要视频再说，本次 3 张静态 png 统一）

## Dependencies and Considerations
- **和全局 Scene/Theme 解耦**：编辑器独立管自己的主题色（`studio-theme-dark/light/khaki`），不读取 `html[data-scene]`。这样用户即使在全局"雪景冰蓝"下写文档，编辑器也能选"卡其米色"专心写，互不干扰。
- **不影响其他页面**：所有 CSS 都限定在 `.studio-root` scope 内，landing / plans / chat-room / dashboard 完全不变
- **Milkdown `.ProseMirror`**：需要用高优先级覆盖，否则 Milkdown 默认的文字颜色会抢（`.studio-theme-light.studio-root .ProseMirror { color: #222; }`）
- **透明度滑条 UX**：min=0 时背景完全不透明（面板遮罩色值为 100%），用户不希望看到任何图 → 值映射 `opacity (0-100) → surface-alpha = 1 - opacity/100`（透明度数值 = 背景图的可见度，面板越透明图越清晰）
- **rain 背景图素材缺口**：现在 public/ 下没有 rain.png（只有 rain.mp4）→ 本计划默认「rain 背景」先复用 cloud.png 或生成渐变占位（CSS linear-gradient），用户提供 rain.png 后直接替换 URL 即可，不需要改代码结构

## Validation
1. 打开任意 docs/[id] → 顶栏左侧看到 3 主题按钮 + 3 背景按钮 + 透明度滑条（移动端为 ⚙️ Popover）
2. 暗→亮→卡其 各点一次：文档文字色/代码块底色、阅读面板底色立刻切换（平滑过渡 300ms）
3. 滑条从 30% → 80% → 0% → 100%：背景图清晰度渐变，文字始终可读（0% 时完全不透明看不到图）
4. 背景按钮 rain→snow→cloud：图切换 700ms 淡入淡出
5. 刷新页面 → 三件套状态自动恢复（localStorage）
6. 「左右对照」双栏模式下阅读面板和编辑面板颜色一致
7. 代码块暗色→亮色→卡其正确变色（hljs 关键字正确可读）
8. 切回全局场景 snow/cloud/rain 不影响编辑器主题，互不干扰
9. `GetDiagnostics` 返回空（0 报错）
10. 移动端 Popover 打开可完整操作三件套

## Risks
1. **Milkdown 样式抢优先级**：Milkdown 默认注入的 CSS 可能和 studio-theme.css 冲突 → 用 `.studio-theme-X.studio-root .ProseMirror` 双 class scope + `!important`（仅 2-3 处 color）兜底
2. **背景图高内存**：snow.png / cloud.png 可能都 > 2MB，三图 DOM 同时存在可能占内存 → 只渲染当前选中的一张 `<img>`（或单 div 切 background-image），opacity 过渡保证平滑，不用三图叠加 z-index
3. **Rain 无 rain.png**：用户可能会说"没有雨林背景图"→ 计划里明确占位方式，用户提供后直接塞 public/rain.png 即可无缝生效（或在 plan 中标注"后续素材"）
4. **透明度滑条 + 顶栏半透明**：顶栏如果 bg-transparent，可能会被文字和背景图叠在一起看不清楚 → 顶栏单独用 `--studio-surface` × 更高的 `--studio-opacity-header`（比编辑器面板多 15% opacity）保证可读性；或直接固定独立的不透明度（不和滑条耦合）
5. **代码块 !important 覆盖链**：markdown.css 用 `!important` 导致 light/khaki 代码块改不了 → 在 studio-theme.css 中使用 `:where(.studio-root)` 外层 + `.studio-theme-light` + `.markdown-body pre.code-block` 三层选择器，并且也加 `!important`（比 markdown.css 选择器更具体）
