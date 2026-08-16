// 独立进程需要自己加载环境变量（Next.js 会加载 .env.local，但 tsx 不会）
// 必须在其它模块之前 import，确保 DATABASE_URL / DASHSCOPE_* 可用

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
