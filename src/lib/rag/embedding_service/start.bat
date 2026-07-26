@echo off
echo ========================================
echo   RAG Embedding Service
echo   bge-m3 + bge-reranker-v2-m3
echo ========================================
echo.
echo 首次启动会自动下载模型（约 2-3 GB），请耐心等待...
echo 模型缓存路径: %USERPROFILE%\.cache\huggingface\
echo.
cd /d "%~dp0"
python server.py
pause
