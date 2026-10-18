import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    // 注意：只写 ".next/**" 是不够的。next.config.ts 支持用 NEXT_DIST_DIR 切换输出目录，
    // 项目里就留着 .next-codex/ 和 .next-codex-qa/ 两个历史构建目录。
    // eslint 会去 lint 里面的编译产物（打包后的 chunk），实测贡献了 1.3 万+ 条问题，
    // 并把全量 lint 拖到 374 秒。用通配覆盖所有变体。
    ".next*/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Prisma 生成的 client（约 7.7 万行）。不排除的话 lint 会去扫生成代码，
    // 既慢（全量 lint 从数秒涨到 5 分钟以上）又毫无意义——这些文件不归我们维护。
    // 注意路径：generator 的 output 在 prisma/generated（曾一度放在 src/lib/generated）。
    "prisma/generated/**",
    // 本地工具目录：`.claude/worktrees/` 下有历史 git worktree 的完整副本
    // （246 个源文件，比主 src 还多）。不排除的话全量 lint 会把副本整个扫一遍。
    ".claude/**",
    // 本地临时目录（已在 .gitignore）。里面那份 tmp/pdfs/chrome-profile/ 是某次
    // PDF 工具留下的 Chrome profile，带着一个浏览器扩展的打包产物。
    // 关键在于它**只坑本地**：tmp/ 没被 git 跟踪，CI 的干净检出根本看不到，
    // 所以 CI 一直是绿的，只有本地 `npm run lint` 是红的 —— 极易被误判成
    // 自己刚写的代码出了问题。ESLint 不读 .gitignore，只能在这里显式排除。
    // 同机实测：不排除 1866 problems（48 errors / 1818 warnings）19 秒；
    //           排除后   38 problems（ 0 errors /   38 warnings）14 秒。
    "tmp/**",
  ]),
  {
    /**
     * React Compiler 规则降级说明（显式技术债，非遗漏）
     *
     * next.config.ts 开了 reactCompiler，next 的 react-hooks 预设随之启用这两条新规则。
     * 它们标的是项目**刻意使用**的外部状态同步写法：
     *   - set-state-in-effect：在 effect 里读 localStorage / document.fonts / MutationObserver
     *     后同步 setState（scene-context、SplitText、learning-island、ClickSpark、plan-drawer…）
     *   - refs：render 期把 state 镜像进 ref（variable-proximity）
     *
     * 这些确实属于 React 官方「不推荐」的写法，正解是改用 useSyncExternalStore。
     * 但那是一次跨多个组件的重构，且涉及 hydration 时序（SSR 硬编码 data-scene="rain"），
     * 需要能实际跑起来逐个目视验证。在没做这次重构前先降为 warn：
     * lint 仍能通过，问题也不会被隐藏。修完再改回 error。
     */
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
    },
  },
]);

export default eslintConfig;
