# 贴图素材来源与许可

"写实材质"画风下使用的真实照片贴图。卡通描边画风、直接双击打开网页（file://）或图片加载失败时，游戏退回程序生成的贴图。
地址栏加 `?notex=1` 可以强制关闭，方便对比。

每套素材只保留颜色（`_c`）、法线（`_n`，OpenGL 约定）、粗糙度（`_r`）三张图，并做过预处理：缩小到 512 或 1024 像素；
颜色和粗糙度除以各自的平均值，变成"倍率图"——游戏里再乘上原来指定的底色，所以配色不变，只多出真实的纹理变化
（木地板 `floor_c` 例外，保留照片原色；木纹 `wood_*` 旋转了 90°）。

| 游戏用文件 | 用途 | 原始素材 | 下载地址 | 许可 | 原始压缩包 sha256 |
|---|---|---|---|---|---|
| grass_c / _n / _r.jpg（1024×1024，共 1737 KB） | 草地（纽芬兰机场、爱尔兰牧场与草地跑道） | ambientCG Grass004 | https://ambientcg.com/get?file=Grass004_1K-JPG.zip | CC0 1.0 | `4b63495f459db848…` |
| gravel_c / _n / _r.jpg（1024×1024，共 1401 KB） | 碎石跑道与车辙 | ambientCG Gravel043 | https://ambientcg.com/get?file=Gravel043_1K-JPG.zip | CC0 1.0 | `bca54835c7c71bea…` |
| rock_c / _n / _r.jpg（1024×512，共 441 KB） | 岸坡与山头的岩石 | ambientCG Rock063 | https://ambientcg.com/get?file=Rock063_1K-JPG.zip | CC0 1.0 | `e2974a91631ea872…` |
| floor_c / _n / _r.jpg（1024×512，共 179 KB） | 舱内木地板 | ambientCG WoodFloor043 | https://ambientcg.com/get?file=WoodFloor043_1K-JPG.zip | CC0 1.0 | `0bd1309b36c9a0ad…` |
| wood_c / _n / _r.jpg（512×512，共 166 KB） | 层板舱壁、木制家具与螺旋桨 | ambientCG Wood058 | https://ambientcg.com/get?file=Wood058_1K-JPG.zip | CC0 1.0 | `43e6343524394391…` |
| leather_c / _n / _r.jpg（512×512，共 231 KB） | 皮革座椅、机组皮夹克与飞行帽 | ambientCG Leather037 | https://ambientcg.com/get?file=Leather037_1K-JPG.zip | CC0 1.0 | `7ec86a1e5e4a1a8d…` |
| plates_c / _n / _r.jpg（512×512，共 130 KB） | 金属机身的舱壁与隔框 | ambientCG MetalPlates002 | https://ambientcg.com/get?file=MetalPlates002_1K-JPG.zip | CC0 1.0 | `e3aac6af6cc6e0ed…` |
| fabric_c / _n / _r.jpg（512×512，共 245 KB） | 蒙布舱壁、帆布件与机组长裤 | ambientCG Fabric086 | https://ambientcg.com/get?file=Fabric086_1K-JPG.zip | CC0 1.0 | `f36d944b15b9c108…` |
| water_n.jpg（1024×1024，243 KB，未改动） | 海面波纹法线 | three.js r160 examples/textures/waternormals.jpg | https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/textures/waternormals.jpg | 随 three.js 仓库以 MIT 许可分发 | `add9912b158a4fe9…` |

- ambientCG 的许可说明：https://docs.ambientcg.com/license/ （CC0 1.0，可自由使用、修改，无需署名）。
- three.js 的许可：https://github.com/mrdoob/three.js/blob/r160/LICENSE （MIT）。
- 下载日期：2026-11-16。原始压缩包（共约 57 MB）没有放进项目。
