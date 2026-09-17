"""Sync local site -> GitHub Pages / Cloudflare static deploy directory.

用法:
    cd D:/m2niwa-pages && python sync.py

2026-09 重构后的变化：
  * 页面从「单文件 index.html」变成多页（index + 3 个版本候选 + skills/games/diy）
  * CSS 已抽成外部 /assets/site.css（原来是内联 <style>）
  * 因此本脚本改成「按页面清单整体同步」，并对每个页面剥离本地版专属的动态内容

剥离的内容（本地 FastAPI 才有）：
  * FLOATING DASHBOARD 的 HTML 片段（<aside class="dash-float">）
  * 仪表盘 JS（WebSocket / api/stats 轮询）
  * 浮动仪表盘的滚动跟随（SCROLL WOBBLE）
  * 对应的 CSS 片段（在 site.css 里删掉，避免移动端底部留白）
"""
import os
import re
import shutil

SRC_DIR = r"D:\mywebsite-v2"
DST_DIR = r"D:\m2niwa-pages"

# 需要同步到静态站的页面（game.html 是 2026-08 就有的旧页面，一并带上）
PAGES = [
    "index.html",
    "v1-editorial.html",
    "v2-console.html",
    "v3-magazine.html",
    "v4-horizontal.html",
    "v5-rotate.html",
    "versions.html",
    "skills.html",
    "games.html",
    "diy.html",
    "game.html",
]

# 目录级同步（整体覆盖）
COPY_DIRS = ["assets", "sea-bazaar", "blog"]

# 单文件同步
COPY_FILES = ["robots.txt", "sitemap.xml", "portfolio.pdf"]


def strip_dynamic(html: str) -> str:
    """剥离只有本地 FastAPI 版才成立的动态内容。"""
    html = re.sub(r"<!-- ===== FLOATING DASHBOARD ===== -->.*?</aside>", "", html, flags=re.S)
    html = re.sub(r"/\* ===== FLOATING DASHBOARD JS.*?(?=/\* ===== FADE UP)", "", html, flags=re.S)
    html = re.sub(r"/\* ===== SCROLL WOBBLE.*?(?=/\* ===== FADE UP)", "", html, flags=re.S)
    html = re.sub(r"\n{3,}", "\n\n", html)
    return html


def strip_dashboard_css(css: str) -> str:
    """site.css 里去掉仪表盘相关段落，避免静态站出现无意义的底部留白。"""
    css = re.sub(r"/\* ===== FLOATING DASHBOARD SIDEBAR.*?(?=/\* ===== LIFESTYLE MERGED)", "", css, flags=re.S)
    css = css.replace("  body { padding-bottom: 56px; }\n", "")
    css = css.replace("body { padding-bottom: 56px; }\n", "")
    return re.sub(r"\n{3,}", "\n\n", css)


def main():
    os.makedirs(DST_DIR, exist_ok=True)

    # 1) 页面
    for name in PAGES:
        src = os.path.join(SRC_DIR, name)
        if not os.path.exists(src):
            print(f"  [skip] 源文件不存在: {name}")
            continue
        with open(src, "r", encoding="utf-8") as f:
            html = f.read()
        html = strip_dynamic(html)
        with open(os.path.join(DST_DIR, name), "w", encoding="utf-8", newline="\n") as f:
            f.write(html)
        print(f"  [page] {name:22} {len(html):>7} 字符")

    # 2) 目录
    for d in COPY_DIRS:
        src = os.path.join(SRC_DIR, d)
        dst = os.path.join(DST_DIR, d)
        if not os.path.isdir(src):
            print(f"  [skip] 目录不存在: {d}")
            continue
        shutil.copytree(src, dst, dirs_exist_ok=True)
        print(f"  [dir ] {d}/")

    # 3) site.css 去仪表盘段
    css_dst = os.path.join(DST_DIR, "assets", "site.css")
    if os.path.exists(css_dst):
        with open(css_dst, "r", encoding="utf-8") as f:
            css = f.read()
        stripped = strip_dashboard_css(css)
        with open(css_dst, "w", encoding="utf-8", newline="\n") as f:
            f.write(stripped)
        print(f"  [css ] site.css 剥离仪表盘段: {len(css)} -> {len(stripped)} 字符")

    # 4) 单文件
    for name in COPY_FILES:
        src = os.path.join(SRC_DIR, name)
        if os.path.exists(src):
            shutil.copy(src, os.path.join(DST_DIR, name))
            print(f"  [file] {name}")

    # 5) 自检
    print("\n自检：")
    idx = os.path.join(DST_DIR, "index.html")
    with open(idx, "r", encoding="utf-8") as f:
        h = f.read()
    print(f"  index.html data-en={h.count('data-en=')}  dash 残留={'dash-float' in h}")
    for p in PAGES:
        fp = os.path.join(DST_DIR, p)
        if os.path.exists(fp):
            with open(fp, "r", encoding="utf-8") as f:
                c = f.read()
            issues = []
            if "dash-float" in c:
                issues.append("dash残留")
            if c.count("<script") != c.count("</script>"):
                issues.append("script标签不配对")
            if "FLOATING DASHBOARD JS" in c:
                issues.append("dashboardJS残留")
            print(f"  {p:22} {'OK' if not issues else ' / '.join(issues)}")


if __name__ == "__main__":
    main()
