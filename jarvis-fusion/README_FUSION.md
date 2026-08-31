# JARVIS Obsidian 融合（镜像）

本目录是 jarvis-runtime feat/obsidian-fusion（580cf5）的只读镜像，供外审在 summer-checkin 仓内可见。

- 源仓：jarvis-runtime（非 git，见 C:\Users\LENOVO\Documents\Codex\知识资产\02-JARVIS\jarvis-runtime，分支 eat/obsidian-fusion）
- Vault：D:\OptoKB（6-Agent 全区，75文件已验证）
- 双池：LOW=deepseek-v4-flash / HIGH=muse-spark-1.2-contributor（去限额）
- RAG：Summer 本体为 jsonb+JS cosine Top1000（LIMIT 1000暴力排序），非 pgvector 原生 vector；JARVIS 侧为 pgvector jarvis_chunks
- 场景：Summer 仅雨林独立房，雪日/暖云仅换色板
- 外审请以 jarvis-runtime 为准，本目录不参与构建。
