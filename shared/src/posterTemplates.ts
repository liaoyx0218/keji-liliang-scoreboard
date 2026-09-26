import { seqToGroupName, seqToTheme, seqToThemeLabel, type SortTheme } from "./groupName.js";
import type { PosterFields } from "./types.js";

export type { PosterFields };

export type PosterRole = "origin" | "tech" | "dream";

export type PosterTemplate = {
  theme: SortTheme;
  themeLabel: string;
  role: PosterRole;
  roleLabel: string;
  layoutHint: string;
  defaults: PosterFields;
};

const ROLE_META: {
  role: PosterRole;
  roleLabel: string;
  layoutHint: string;
  /** 强制视觉差异，避免同主题三组出图雷同 */
  visualFingerprint: string;
}[] = [
  {
    role: "origin",
    roleLabel: "溯源",
    layoutHint:
      "竖版手抄报：顶部大标题+圆角提问小标题；画面用一条弯曲道路/时间带从古到今串联；沿途至少3个彩色圆角内容框，每框配2～3个阶段小插画；中部可有「为什么变好了」图标条（4个小圆标）；底部感悟框旁画一名背书包的小学生和对话框；禁止做成科技发明卡片矩阵或古/今/未来三栏畅想",
    visualFingerprint:
      "主色偏暖黄土与纸本米黄；弯曲时间路像历史故事书；多画物件外形与材料变化，少画现代机器特写；角落标注「溯源」",
  },
  {
    role: "tech",
    roleLabel: "赋能",
    layoutHint:
      "竖版手抄报：顶部大标题+圆角提问小标题；中间 4～6 张圆角科技发明卡片（每张含发明插画+短说明）；卡片之间用虚线/箭头连接；另有一条「科技带来什么」四图标横条；底部探索精神感悟框+小学生角色对话框；禁止做成完整演变时间线或古/今/未来三栏",
    visualFingerprint:
      "主色偏青蓝与科技感；画面像发明展板；突出工具、设备、技术特写；齿轮/灯泡等小装饰；角落标注「赋能」",
  },
  {
    role: "dream",
    roleLabel: "畅想",
    layoutHint:
      "竖版手抄报：顶部大标题+圆角提问小标题；左栏「古」痛点、中栏「今」改善、右栏「未来」畅想（三栏圆角框，各配插画）；底部感悟大框+小学生角色说「我要学习这种精神」类短句；点缀小植物/云朵装饰；禁止做成多段时间线或发明卡片矩阵",
    visualFingerprint:
      "主色偏青绿与晚霞粉；画面像对比拼贴+未来想象；可出现未来场景剪影；角落标注「畅想」",
  },
];

const THEME_TECH_EXAMPLES: Record<SortTheme, string> = {
  yi: "织布机、缝纫机、新型面料、智能穿戴",
  shi: "液化气灶、冰箱、电饭煲、自动炒菜机",
  zhu: "砖瓦结构、钢筋混凝土、水电燃气、智能家居",
};

const DEFAULTS: Record<SortTheme, [PosterFields, PosterFields, PosterFields]> = {
  yi: [
    {
      title: "衣服时光演变",
      subtitle: "从兽皮树叶到现代面料",
      body: [
        "① 兽皮树叶：遮体保暖，材料简陋",
        "② 粗麻布：手工纺织，粗糙但耐用",
        "③ 手工棉布：更柔软舒适",
        "④ 机织棉布：机器生产，产量大",
        "⑤ 现代多功能面料：透气、防水、智能",
      ].join("\n"),
      summary: "衣服一步步变得更舒适、更方便。",
    },
    {
      title: "科技让衣服更美好",
      subtitle: "发明改变穿衣体验",
      body: [
        "织布机：让布料产量大增",
        "纺织技术：棉麻丝更精细柔软",
        "缝纫机：缝制更快更整齐",
        "新型面料：防水透气、不易皱",
        "智能穿戴：调温、监测、便捷生活",
      ].join("\n"),
      summary: "科技让衣服更舒适、更方便。",
    },
    {
      title: "穿衣生活畅想",
      subtitle: "古今对比 · 未来衣服",
      body: [
        "古：材料少、难洗难做、不保暖",
        "今：款式多、好洗易穿、四季皆宜",
        "未来：随天气变色调温、自清洁、可回收",
        "感悟：科技改善穿衣体验，生活更美好",
      ].join("\n"),
      summary: "科技让我们穿得更舒适、更自在。",
    },
  ],
  shi: [
    {
      title: "烹饪时光演变",
      subtitle: "从篝火到自动炒菜",
      body: [
        "① 篝火生食烤煮：原始烹饪",
        "② 陶釜陶罐：可煮可炖",
        "③ 土灶柴火铁锅：家常烟火",
        "④ 液化气灶：点火方便、火力稳",
        "⑤ 电饭煲：一键煮熟",
        "⑥ 自动炒菜机：省力又均匀",
      ].join("\n"),
      summary: "做饭方式一步步更省力、更安全。",
    },
    {
      title: "科技让饮食更美味",
      subtitle: "灶具与保鲜的力量",
      body: [
        "灶具革新：柴火→燃气→电磁炉",
        "电饭煲：控温煮熟，操作简单",
        "冰箱保鲜：食物更新鲜更营养",
        "自动炒菜：解放双手、火候更稳",
        "科技让烹饪更省力，吃得更好",
      ].join("\n"),
      summary: "科技让食物更营养、烹饪更省力。",
    },
    {
      title: "舌尖上的畅想",
      subtitle: "古今饮食 · 未来厨房",
      body: [
        "古：生火难、费时费力、保存不易",
        "今：一键烹饪、保鲜方便、菜品丰富",
        "利：省时营养；弊：过度加工要留意",
        "未来：智能厨房、定制营养餐",
        "感悟：科技改变饮食，也要健康选择",
      ].join("\n"),
      summary: "科技给饮食生活带来巨大影响。",
    },
  ],
  zhu: [
    {
      title: "住所时光演变",
      subtitle: "从山洞到智能家居",
      body: [
        "① 山洞巢穴：遮风避雨",
        "② 茅草屋：就地取材",
        "③ 土坯房：更坚固耐用",
        "④ 砖瓦平房：更好防潮保温",
        "⑤ 高层楼房：住得更高更密",
        "⑥ 高楼智能家居：安全舒适便捷",
      ].join("\n"),
      summary: "居住环境一步步更安全、更宜居。",
    },
    {
      title: "科技筑就美好家园",
      subtitle: "建筑与智能改善居住",
      body: [
        "建筑材料：土坯→砖瓦→钢筋水泥",
        "结构技术：高层稳固、抗震防火",
        "水电燃气：生活基础设施完善",
        "智能设备：灯光、安防、温控",
        "科技让居住更安全、更宜居",
      ].join("\n"),
      summary: "科技让居住条件更舒适宜居。",
    },
    {
      title: "家园畅想",
      subtitle: "古今住房 · 智慧未来",
      body: [
        "古：潮湿阴暗、易塌、空间小",
        "今：坚固明亮、设施齐全、社区便利",
        "未来：节能环保、机器人管家、智慧社区",
        "感悟：科技让家更温暖、更有力量",
      ].join("\n"),
      summary: "科技对居住生活价值巨大。",
    },
  ],
};

export function seqToPosterRole(seq: number): PosterRole {
  if (!Number.isInteger(seq) || seq < 1) throw new Error(`seq out of range: ${seq}`);
  return ROLE_META[(seq - 1) % 3].role;
}

export function getPosterTemplate(seq: number): PosterTemplate {
  const theme = seqToTheme(seq);
  const slot = (seq - 1) % 3;
  const roleMeta = ROLE_META[slot];
  return {
    theme,
    themeLabel: seqToThemeLabel(seq),
    role: roleMeta.role,
    roleLabel: roleMeta.roleLabel,
    layoutHint: roleMeta.layoutHint,
    defaults: { ...DEFAULTS[theme][slot] },
  };
}

export function normalizePosterFields(input: unknown): PosterFields | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const title = typeof o.title === "string" ? o.title.trim() : "";
  const subtitle = typeof o.subtitle === "string" ? o.subtitle.trim() : "";
  const body = typeof o.body === "string" ? o.body.trim() : "";
  const summary = typeof o.summary === "string" ? o.summary.trim() : "";
  if (!title && !subtitle && !body && !summary) return null;
  return {
    title: title.slice(0, 80),
    subtitle: subtitle.slice(0, 120),
    body: body.slice(0, 1200),
    summary: summary.slice(0, 200),
  };
}

/** 根据模板与字段拼装文生图提示词 */
export function buildPosterPrompt(
  template: PosterTemplate,
  fields: PosterFields,
  groupName: string
): string {
  const name = groupName || seqToGroupName(1);
  const slotMeta = ROLE_META.find((r) => r.role === template.role) ?? ROLE_META[0];
  const techHint =
    template.role === "tech"
      ? `本组科技卡片优先画：${THEME_TECH_EXAMPLES[template.theme]}。`
      : "";
  return [
    "请生成一张竖版小学生课堂手抄报海报，参考「科技改变出行」类精品手抄报：元素丰富、分区多、但不杂乱。",
    "整体风格：儿童扁平矢量插画；浅色横线纸本背景；圆角内容框（橙/蓝/黄描边）；小图标点缀（灯泡、齿轮、箭头、地图钉等）；底部可有背书包小学生角色与对话框。",
    "信息密度要高：至少包含 大标题、提问式副标题、3个以上内容分区框、一组阶段/发明小插画、一条图标说明条、底部感悟框；文字清晰可读的中文，不要英文乱码，不要水印。",
    `主题：${template.themeLabel}；小组：${name}；本组唯一侧重：${template.roleLabel}（不要混入另外两种侧重）。`,
    `版式要求（必须遵守）：${template.layoutHint}。${techHint}`,
    `视觉差异（必须遵守）：${slotMeta.visualFingerprint}。`,
    `大标题：${fields.title}`,
    `提问式副标题（可做成圆角标签）：${fields.subtitle}`,
    `正文要点（分区框里的中文内容以这些为准，可略作口语化，但不要改成别组结构）：\n${fields.body}`,
    `总结句（放进底部感悟框，可旁配小学生说「我要学习这种精神！」）：${fields.summary}`,
    "画面要像可投屏的完整课堂手抄报：层次分明、装饰充足、适合小学三年级。",
  ].join("\n");
}
