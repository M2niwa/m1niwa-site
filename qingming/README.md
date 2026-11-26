# 青冥劫 · 行者菜单（Three.js 原型）

水墨暗金美术风格 × 生存恐怖式背包/地图系统的角色菜单原型。设定、文案、界面均为原创。

## 运行

ES 模块不能从 `file://` 直接打开，需要本地静态服务器。双击 `start.bat`，或在本目录运行：

```powershell
python -m http.server 8765
```

然后访问 <http://localhost:8765/>。需要联网加载 three.js（jsDelivr）与 Google Fonts。

## 页面

| 页签 | 内容 | 操作 |
|---|---|---|
| 行者 | 气血/气力/法力、根骨、脉象、披挂、法门；中间为实时 3D 角色（描边、轮廓光、墨痕背景） | 拖拽转身，轻点或 Space 出刀 |
| 行囊 | 8×6 格子背包（末行需腰囊解锁）、物件实时 3D 检视、快捷四向位、脉象 | 拖拽移动、拖拽时 R/右键/滚轮旋转、拖到可配伍之物上合成；方向键选择、Enter 使用、C 合成、F 快捷、Z/X 分类 |
| 舆图 | 三层寺院平面：朱=尚有遗物、青=已搜尽、斜线=未踏足、金=净室、紫=封印；门锁、楼梯、行者位置 | 拖拽平移、滚轮缩放、PgUp/PgDn 换层、Space 定位；启用「寻踪罗盘」后显示遗物 |
| 卷宗 | 手札/告示/异闻，竖排阅读，未读红点 | ↑↓ 翻阅 |

Q / E 切换页签，地址栏 `#hero` `#bag` `#map` `#files` 可直达。

## 可试的交互

- 青蒿 + 朱榴 → 回春散（服用后气血全满，脉象由「弦」转「平」）
- 青蒿 + 青蒿 → 青蒿散；黄表纸 + 朱砂 → 镇尸符 ×6（叠入已有符箓）
- 辟蛊散：祛除蛊毒，脉象由紫转常色
- 粗布腰囊：解锁第六行
- 寻踪罗盘：舆图标出遗物，房间详情列出遗物缩略图
- 装备/卸下兵刃会改变「行者」页的攻击数值

## 结构

```
index.html          页面骨架
css/style.css       样式（单一夜色主题）
js/main.js          入口：状态、页签、键盘、提示、缩略图
js/stage.js         Three.js：水墨背景着色器、余烬、器物检视、角色、缩略图渲染
js/bag.js           行囊：格子放置、拖拽、旋转、合成、快捷
js/map.js           舆图：SVG 手绘墨线平面图
js/hero.js          行者页
js/files.js         卷宗页
js/pulse.js         脉象（心电式）波形
js/proc.js          程序化模型与贴图（符箓、黄表纸、腰囊、药包、圆相、墨痕）
js/data.js          物品、配方、房间、文书等数据
js/icons.js         game-icons.net 图标路径（由 assets/icons 生成）
assets/models/      开源 3D 模型
assets/credits.json 素材来源与许可
```

## 开源素材与许可

- **3D 模型（CC0）**：Poly Haven —— Bull Head、Horse Head、Lantern 01、Brass Vase 03/04、Antique Katana 01、Pomegranate、Dandelion 01、Sea Dog's Compass、Antique Ceramic Vase 01、Ornate Medieval Dagger、Chinese Screen Panels；Quaternius（经 Poly Pizza）—— Hooded Adventurer。各模型作者见 `assets/credits.json`。
- **图标（CC BY 3.0）**：game-icons.net，作者 Lorc、Delapouite、Lucasms。
- **字体（SIL OFL 1.1）**：Noto Serif SC、Ma Shan Zheng、Liu Jian Mao Cao（Google Fonts）。
- **引擎（MIT）**：three.js r160。

界面风格参考自 interfaceingame.com 上收录的游戏界面截图，仅作风格研究，未使用其中任何图像。
