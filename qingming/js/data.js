// 《青冥劫》界面原型 —— 全部为原创设定与文案
// 品阶：0 凡品 / 1 良品 / 2 珍品 / 3 奇品
export const RARITY = [
  { name: '凡品', color: '#8b8272' },
  { name: '良品', color: '#7ea58c' },
  { name: '珍品', color: '#9a82cf' },
  { name: '奇品', color: '#d4913f' },
];

export const CATEGORIES = [
  { id: 'all', name: '全部', icon: 'knapsack' },
  { id: 'weapon', name: '兵刃', icon: 'crossed-swords' },
  { id: 'med', name: '药物', icon: 'herbs-bundle' },
  { id: 'tool', name: '法器', icon: 'paper-lantern' },
  { id: 'key', name: '要物', icon: 'skeleton-key' },
  { id: 'mat', name: '材料', icon: 'mortar' },
];

// model: assets/models/<id>/<id>.gltf ; proc: 程序化生成的模型
// thumb / view: 缩略图与检视时的摆放角度 (弧度)
export const ITEM_DEFS = {
  miaodao: {
    name: '霜脊苗刀', cat: 'weapon', rarity: 2, w: 4, h: 1, stack: 1,
    model: 'antique_katana_01', align: 'x', thumb: { rx: 0.35 }, view: { rz: 0.5, ry: 0.35 },
    tag: '长兵 · 双手',
    desc: '刀身狭长，刃口泛着一线霜色。前任主人在刀镡内侧刻了“莫回头”三字。',
    stats: [['攻', 64], ['会心', '8%'], ['破蛊', '中']],
    use: 'equip', slot: 'main',
  },
  duanbi: {
    name: '錾银短匕', cat: 'weapon', rarity: 1, w: 2, h: 1, stack: 1,
    model: 'ornate_medieval_dagger', align: 'x', thumb: { rx: 0.35 }, view: { rz: 0.6, ry: 0.4 },
    tag: '短兵 · 可格挡',
    desc: '贴身防身之物。被尸傀扑倒时，可用它挣脱一次，但刃口会因此崩损。',
    stats: [['攻', 22], ['耐久', '3/5'], ['挣脱', '可']],
    use: 'equip', slot: 'off',
  },
  yinhundeng: {
    name: '引魂铜灯', cat: 'tool', rarity: 3, w: 2, h: 2, stack: 1,
    model: 'Lantern_01', thumb: { ry: 0.5 }, view: { ry: 0.6 },
    tag: '法器 · 照幽',
    desc: '灯芯以檀香与骨灰捻成。灯火所及之处，藏在暗处的遗物会泛出微光。',
    stats: [['照幽', '十步'], ['灯油', '7/10']],
    use: 'equip', slot: 'tool',
  },
  huichunhu: {
    name: '回春铜壶', cat: 'med', rarity: 2, w: 1, h: 2, stack: 1, charges: [3, 5],
    model: 'brass_vase_03', view: { ry: 0.3 },
    tag: '药器 · 可于净室续满',
    desc: '壶中是以青蒿、当归熬成的药汤。饮一口可回复四成气血，于净室焚香后续满。',
    stats: [['回复', '40%'], ['余量', '3/5']],
    use: 'drink',
  },
  qinghao: {
    name: '青蒿', cat: 'med', rarity: 0, w: 1, h: 1, stack: 1,
    model: 'dandelion_01', node: 'dandelion_01_c_LOD0', thumb: { rx: 0.25 }, view: { ry: 0.2 },
    tag: '药草 · 可调配',
    desc: '寺后药圃里随处可见。单用可止血回气；与朱榴同捣，药力倍增。',
    stats: [['回复', '15%']],
    use: 'heal', heal: 0.15,
  },
  zhuliu: {
    name: '朱榴', cat: 'med', rarity: 1, w: 1, h: 1, stack: 1,
    model: 'food_pomegranate_01', thumb: { rx: 0.3 }, view: { ry: 0.8, rx: 0.2 },
    tag: '药果 · 不可单服',
    desc: '果肉殷红似血。性烈，单服伤脾，须与青蒿调和后方可入口。',
    stats: [['配伍', '青蒿']],
    use: 'none', hint: '朱榴性烈，须与青蒿调和。',
  },
  bigusan: {
    name: '辟蛊散', cat: 'med', rarity: 2, w: 1, h: 2, stack: 1,
    model: 'antique_ceramic_vase_01', view: { ry: 0.5 },
    tag: '解药 · 祛蛊毒',
    desc: '药房最后一瓶。瓶底压着一张字条：“服后三个时辰内，勿近井水。”',
    stats: [['祛除', '蛊毒'], ['抗蛊', '+10']],
    use: 'cure',
  },
  fulu: {
    name: '镇尸符', cat: 'weapon', rarity: 1, w: 1, h: 1, stack: 30,
    proc: 'talisman', thumb: { rz: 0.12 }, view: { ry: 0.3, rx: -0.15 },
    tag: '符箓 · 投掷',
    desc: '黄纸朱砂所书。贴于尸傀额前，可令其僵立三息。焚烧时有极淡的檀香味。',
    stats: [['定身', '3 息'], ['上限', '30']],
    use: 'none', hint: '符箓须在战斗中投出。',
  },
  huangzhi: {
    name: '黄表纸', cat: 'mat', rarity: 0, w: 1, h: 1, stack: 20,
    proc: 'paper', thumb: { ry: 0.5, rx: 0.5 }, view: { ry: 0.6, rx: 0.3 },
    tag: '材料 · 制符',
    desc: '裁好的符纸，边角受了潮。与朱砂相合可书写镇尸符。',
    stats: [['配伍', '朱砂']],
    use: 'none', hint: '与朱砂合成，可得镇尸符。',
  },
  zhusha: {
    name: '辰州朱砂', cat: 'mat', rarity: 1, w: 1, h: 1, stack: 10,
    model: 'brass_vase_04', view: { ry: 0.4 },
    tag: '材料 · 制符',
    desc: '盛在小铜罐里的朱砂，色正如血。一罐可书六道符。',
    stats: [['配伍', '黄表纸']],
    use: 'none', hint: '与黄表纸合成，可得镇尸符。',
  },
  luopan: {
    name: '寻踪罗盘', cat: 'tool', rarity: 2, w: 2, h: 2, stack: 1,
    model: 'seadogs_compass', thumb: { rx: 0.75 }, view: { rx: 0.9 },
    tag: '法器 · 寻物',
    desc: '指针不指南北，只指“未取之物”。使用后，舆图上会标出各处遗物的位置。',
    stats: [['范围', '全寺']],
    use: 'reveal',
  },
  niushou: {
    name: '牛首铜像', cat: 'key', rarity: 3, w: 2, h: 2, stack: 1,
    model: 'bull_head', thumb: { ry: -0.6 }, view: { ry: -0.5 },
    tag: '要物 · 阴司门之一',
    desc: '从天王殿神龛中取下。底座有榫，形如钥齿。铭文云：“牛首东望。”',
    stats: [['用处', '阴司门']],
    use: 'none', hint: '须在地宫阴司门前使用。',
  },
  mamian: {
    name: '马面铜像', cat: 'key', rarity: 3, w: 2, h: 2, stack: 1,
    model: 'horse_head', thumb: { ry: 0.6 }, view: { ry: 0.5 },
    tag: '要物 · 阴司门之二',
    desc: '与牛首铜像成对。铭文云：“马面西顾。”',
    stats: [['用处', '阴司门']],
    use: 'none', hint: '须在地宫阴司门前使用。',
  },
  yaonang: {
    name: '粗布腰囊', cat: 'tool', rarity: 1, w: 1, h: 1, stack: 1,
    proc: 'pouch', view: { ry: 0.4 },
    tag: '扩充 · 行囊',
    desc: '针脚细密的布囊，系在腰间可多带些零碎。使用后行囊扩充一行。',
    stats: [['行囊', '+8 格']],
    use: 'expand',
  },
  qinghaosan: {
    name: '青蒿散', cat: 'med', rarity: 1, w: 1, h: 1, stack: 1,
    proc: 'packet', procColor: 0x6f8f5a, thumb: { ry: 0.5, rx: 0.5 }, view: { ry: 0.5, rx: 0.3 },
    tag: '药散 · 调配所得',
    desc: '两株青蒿捣碎晒干，以油纸包好。',
    stats: [['回复', '40%']],
    use: 'heal', heal: 0.4,
  },
  huichunsan: {
    name: '回春散', cat: 'med', rarity: 2, w: 1, h: 1, stack: 1,
    proc: 'packet', procColor: 0xa8432f, thumb: { ry: 0.5, rx: 0.5 }, view: { ry: 0.5, rx: 0.3 },
    tag: '药散 · 调配所得',
    desc: '青蒿与朱榴同捣，色如胭脂。服之气血尽复。',
    stats: [['回复', '100%']],
    use: 'heal', heal: 1,
  },
};

// 合成配方（顺序无关）
export const RECIPES = [
  { a: 'qinghao', b: 'qinghao', out: 'qinghaosan', n: 1, text: '两株青蒿捣作青蒿散。' },
  { a: 'qinghao', b: 'zhuliu', out: 'huichunsan', n: 1, text: '青蒿调和朱榴，制成回春散。' },
  { a: 'huangzhi', b: 'zhusha', out: 'fulu', n: 6, partial: true, text: '研墨蘸砂，书成镇尸符六道。' },
];

// 初始行囊：x, y 为格坐标，r 为是否旋转 90°
export const START_BAG = [
  { def: 'miaodao', x: 0, y: 0, r: 0, equipped: true },
  { def: 'duanbi', x: 0, y: 1, r: 0 },
  { def: 'yinhundeng', x: 4, y: 0, r: 0, equipped: true },
  { def: 'huichunhu', x: 6, y: 0, r: 0, charges: 3 },
  { def: 'luopan', x: 2, y: 1, r: 0 },
  { def: 'niushou', x: 4, y: 2, r: 0 },
  { def: 'qinghao', x: 0, y: 2, r: 0 },
  { def: 'qinghao', x: 1, y: 2, r: 0 },
  { def: 'zhuliu', x: 0, y: 3, r: 0 },
  { def: 'bigusan', x: 7, y: 0, r: 0 },
  { def: 'fulu', x: 6, y: 2, r: 0, count: 18 },
  { def: 'huangzhi', x: 7, y: 2, r: 0, count: 4 },
  { def: 'zhusha', x: 6, y: 3, r: 0, count: 2 },
  { def: 'yaonang', x: 1, y: 3, r: 0 },
];

export const BAG_COLS = 8;
export const BAG_ROWS = 6;
export const BAG_OPEN_ROWS = 5; // 最后一行需腰囊解锁

export const HERO = {
  name: '寒鸦',
  title: '游方驱邪人',
  level: 17,
  hp: 168, hpMax: 480,
  sp: 220, spMax: 260,
  mp: 90, mpMax: 150,
  poison: true,
  base: { atk: 78, def: 88, crit: 4, resist: 35 },
  wear: [
    { slot: '头', name: '竹编斗笠', note: '护体 +12', icon: 'hood' },
    { slot: '身', name: '玄色行衣', note: '护体 +30 · 抗蛊 +5', icon: 'cloak' },
    { slot: '符', name: '雷击木符', note: '受击时 15% 震退', icon: 'wax-seal' },
  ],
  skills: [
    { name: '定身', icon: 'meditation', cost: '法力 30', cd: '18 息', desc: '掐诀令一名敌人僵立，镇尸符可延长其时。', lv: 3 },
    { name: '化烟', icon: 'vortex', cost: '气力 40', cd: '6 息', desc: '身化青烟后撤，闪避期间不受蛊毒侵染。', lv: 2 },
    { name: '焚符', icon: 'candle-light', cost: '镇尸符 1', cd: '—', desc: '将符箓点燃掷出，对尸傀造成灼伤。', lv: 1 },
    { name: '听脉', icon: 'heart-beats', cost: '—', cd: '—', desc: '静心可听出三丈内活物的脉息。', lv: 1 },
  ],
};

// 舆图：坐标单位为格（1 格 = 40px，SVG 内换算）
// state: unseen 未踏足 / items 尚有遗物 / clear 已搜尽 / safe 净室 / sealed 封印
export const FLOORS = [
  { id: 'f2', name: '二层', short: '贰' },
  { id: 'f1', name: '一层', short: '壹' },
  { id: 'b1', name: '地宫', short: '幽' },
];

export const ROOMS = [
  // ---- 一层 ----
  { id: 'shanmen', floor: 'f1', name: '山门', rect: [9, 15, 5, 3], state: 'clear', desc: '两扇朱门半掩，门环上缠着褪色的红绳。' },
  { id: 'qianting', floor: 'f1', name: '前庭', rect: [7, 10, 9, 5], state: 'clear', desc: '铜鼎倾倒，香灰被雨水冲成一道道黑痕。' },
  { id: 'tianwang', floor: 'f1', name: '天王殿', rect: [7, 7, 9, 3], state: 'clear', desc: '四天王像皆被人蒙上了黑布。牛首铜像原供于此。' },
  { id: 'daxiong', floor: 'f1', name: '大雄宝殿', rect: [7, 1, 9, 6], state: 'items', desc: '佛像背后有新掘的土痕，一路延向后院。', loot: ['fulu', 'qinghao'] },
  { id: 'yaofang', floor: 'f1', name: '东厢 · 药房', rect: [16, 6, 5, 5], state: 'items', desc: '药柜被翻得七零八落，地上有拖拽的血迹。', loot: ['zhuliu', 'huangzhi'] },
  { id: 'jingshi', floor: 'f1', name: '净室', rect: [16, 11, 4, 3], state: 'safe', desc: '炉中香火未熄。尸傀不近此处，可在此歇息、整理行囊。' },
  { id: 'zhaitang', floor: 'f1', name: '西厢 · 斋堂', rect: [2, 6, 5, 6], state: 'clear', desc: '长桌上的粥早已发黑，碗筷摆放得整整齐齐。' },
  { id: 'cangjing', floor: 'f1', name: '藏经阁', rect: [1, 1, 6, 5], state: 'items', desc: '经卷散落一地，书架间结满了白色的丝。', loot: ['zhusha'] },
  { id: 'houyuan', floor: 'f1', name: '后院 · 枯井', rect: [16, 1, 6, 5], state: 'unseen', desc: '尚未踏足。夜里能听见井下传来敲击声。' },
  { id: 'zhonglou1', floor: 'f1', name: '钟楼', rect: [3, 12, 4, 4], state: 'clear', desc: '木梯通往二层钟室，梯板上有新鲜的泥脚印。' },
  // ---- 二层 ----
  { id: 'cangjing2', floor: 'f2', name: '藏经阁 · 上层', rect: [1, 1, 5, 5], state: 'unseen', desc: '入口被倒下的书架堵住了。' },
  { id: 'huilang', floor: 'f2', name: '北回廊', rect: [6, 2, 11, 2], state: 'clear', desc: '木板松动，走过时吱呀作响。' },
  { id: 'chanfang1', floor: 'f2', name: '住持禅房', rect: [17, 1, 5, 5], state: 'clear', desc: '书案上压着住持的手札，墨迹未干。' },
  { id: 'chanfang2', floor: 'f2', name: '客寮', rect: [9, 4, 6, 4], state: 'unseen', desc: '门从里面闩住了。' },
  { id: 'dianlang', floor: 'f2', name: '西回廊', rect: [6, 4, 2, 8], state: 'clear', desc: '连接钟室与北回廊。' },
  { id: 'zhonglou2', floor: 'f2', name: '钟室', rect: [3, 12, 4, 4], state: 'items', desc: '铜钟内壁刻满了往生咒。马面铜像就挂在钟舌上。', loot: ['mamian'] },
  // ---- 地宫 ----
  { id: 'yongdao', floor: 'b1', name: '地宫甬道', rect: [8, 2, 3, 10], state: 'unseen', desc: '自枯井而下。壁上有指甲抓挠的痕迹。' },
  { id: 'yinsimen', floor: 'b1', name: '阴司门', rect: [11, 5, 5, 4], state: 'sealed', desc: '青铜门上有两处凹槽，一处形如牛首，一处形如马面。', need: ['niushou', 'mamian'] },
  { id: 'chaoxue', floor: 'b1', name: '尸蛊巢', rect: [16, 3, 6, 8], state: 'unseen', boss: true, desc: '……' },
  { id: 'kujing', floor: 'b1', name: '井底', rect: [6, 12, 5, 3], state: 'unseen', desc: '积水没过脚踝。' },
];

// 门：[x1,y1,x2,y2] 为门洞所在的边，lock: 锁的类型
export const DOORS = [
  { floor: 'f1', at: [11, 15, 12, 15] }, { floor: 'f1', at: [11, 10, 12, 10] }, { floor: 'f1', at: [11, 7, 12, 7] },
  { floor: 'f1', at: [16, 8, 16, 9] }, { floor: 'f1', at: [17, 11, 18, 11] }, { floor: 'f1', at: [7, 8, 7, 9] },
  { floor: 'f1', at: [4, 6, 5, 6] }, { floor: 'f1', at: [7, 12.5, 7, 13.5] }, { floor: 'f1', at: [4.5, 12, 5.5, 12] },
  { floor: 'f1', at: [7, 3, 7, 4] },
  { floor: 'f1', at: [16, 3, 16, 4], lock: 'padlock', note: '后院门 · 需“后院铜钥”' },
  { floor: 'f2', at: [6, 2.6, 6, 3.4], lock: 'padlock', note: '书架阻挡' },
  { floor: 'f2', at: [17, 2.6, 17, 3.4] },
  { floor: 'f2', at: [11.5, 4, 12.5, 4], lock: 'padlock', note: '客寮 · 门闩在内侧' },
  { floor: 'f2', at: [6.5, 4, 7.5, 4] }, { floor: 'f2', at: [6.1, 12, 6.9, 12] },
  { floor: 'b1', at: [11, 6.5, 11, 7.5], lock: 'seal', note: '阴司门 · 需牛首、马面铜像' },
  { floor: 'b1', at: [16, 6.5, 16, 7.5] }, { floor: 'b1', at: [9, 12, 10, 12] },
];

export const STAIRS = [
  { floor: 'f1', at: [6.2, 15.2], to: 'f2', label: '上至钟室' },
  { floor: 'f2', at: [6.2, 15.2], to: 'f1', label: '下至钟楼' },
  { floor: 'f1', at: [21.2, 5.2], to: 'b1', label: '枯井 · 通地宫' },
  { floor: 'b1', at: [10.2, 14.2], to: 'f1', label: '攀上井口' },
];

export const PLAYER = { floor: 'f1', at: [11.5, 4.6], dir: -Math.PI / 2, room: 'daxiong' };

export const OBJECTIVE = '寻得马面铜像，开启地宫阴司门';

export const DOCS = [
  {
    id: 'zhuchi', kind: '手札', title: '住持手札 · 其三', from: '住持禅房', isNew: false, seal: '青冥',
    body: [
      '七月既望，后院枯井夜有异声，如人以指叩石。',
      '老衲命弟子以石板封井，并请牛首、马面二像镇于阴司门前。',
      '然自是夜起，寺中僧众多有发痒之症，抓之见血，血色发乌。',
      '药房言此乃尸蛊，非药石所能尽除。唯火与朱砂，可暂阻之。',
      '若有后来者读此，切记：勿饮井水，勿开阴司门。',
    ],
  },
  {
    id: 'yaotong', kind: '手札', title: '药童日记', from: '东厢 · 药房', isNew: true, seal: '药',
    body: [
      '初五。师兄说背上痒，我替他敷了青蒿，他说凉丝丝的很舒服。',
      '初七。师兄不吃斋饭了，只要水。井水。',
      '初九。我也痒了。夜里梦见井底有人唤我小名，声音和娘一模一样。',
      '十一。药柜最后一瓶辟蛊散我藏起来了，藏在……',
      '十二。好饿　好痒　井　　娘在井里',
    ],
  },
  {
    id: 'gaoshi', kind: '告示', title: '山门告示', from: '山门', isNew: false, seal: '告',
    body: [
      '本寺即日起闭门谢客，香客暂勿上山。',
      '寺中有疫，非僧众不得入内。',
      '已入寺者，请于净室焚香静候，切勿擅入后院。',
      '　　　　　　　　　　青冥寺监院　谨白',
    ],
  },
  {
    id: 'shigu', kind: '异闻', title: '尸蛊考', from: '藏经阁', isNew: true, seal: '考',
    body: [
      '尸蛊者，生于阴湿之地，寄于活人血脉。初时肤痒，继而嗜水，终则神智尽失，形同行尸。',
      '其母蛊畏光畏火，常匿于井、窖、地宫之中。母蛊不死，子蛊不绝。',
      '朱砂符箓贴其额，可令僵立片刻；以火焚之，其声如裂帛。',
      '中蛊者脉象先弦后数，若脉微欲绝而色发紫，则蛊已入心。',
    ],
  },
  {
    id: 'mingwen', kind: '异闻', title: '阴司门铭文（拓本）', from: '地宫甬道', isNew: true, seal: '拓',
    body: [
      '牛首东望，马面西顾。',
      '二像归位，阴司自开。',
      '门内无佛，唯有饥者。',
    ],
  },
];
