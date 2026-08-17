"""
PDF 文本提取工具
===============
pip install PyPDF2
python scripts/extract_pdf.py <pdf路径> [输出txt路径]
"""

import sys
import os

try:
    import PyPDF2
except ImportError:
    print("请先安装 PyPDF2: pip install PyPDF2")
    sys.exit(1)


def extract_pdf(pdf_path: str) -> str:
    reader = PyPDF2.PdfReader(pdf_path)
    pages = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text()
        if text:
            pages.append(text)
    return "\n\n".join(pages)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python scripts/extract_pdf.py <pdf路径> [输出txt路径]")
        sys.exit(1)

    pdf_path = sys.argv[1]
    if not os.path.exists(pdf_path):
        print(f"文件不存在: {pdf_path}")
        sys.exit(1)

    output_path = sys.argv[2] if len(sys.argv) > 2 else pdf_path.replace(".pdf", ".txt")

    text = extract_pdf(pdf_path)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(text)

    print(f"提取完成: {len(text)} 字符 -> {output_path}")
