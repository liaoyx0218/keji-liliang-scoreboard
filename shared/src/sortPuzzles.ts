import type { SortTheme } from "./groupName.js";

export type SortCard = {
  id: string;
  label: string;
  /** Public path under /sort/ */
  image: string;
};

export type SortPuzzle = {
  theme: SortTheme;
  themeLabel: string;
  title: string;
  /** Correct order (oldest → newest), card ids */
  order: string[];
  cards: SortCard[];
};

export const SORT_PUZZLES: Record<SortTheme, SortPuzzle> = {
  yi: {
    theme: "yi",
    themeLabel: "衣",
    title: "衣服时光排序",
    order: ["hide", "hemp", "hand_cotton", "machine_cotton", "modern"],
    cards: [
      { id: "hide", label: "兽皮树叶", image: "/sort/yi-hide.jpg" },
      { id: "hemp", label: "粗麻布", image: "/sort/yi-hemp.jpg" },
      { id: "hand_cotton", label: "手工棉布", image: "/sort/yi-hand-cotton.jpg" },
      { id: "machine_cotton", label: "机织棉布", image: "/sort/yi-machine-cotton.jpg" },
      { id: "modern", label: "现代多功能面料", image: "/sort/yi-modern.jpg" },
    ],
  },
  shi: {
    theme: "shi",
    themeLabel: "食",
    title: "饮食时光排序",
    order: ["fire", "pottery", "wood_stove", "gas", "rice_cooker", "auto_cook"],
    cards: [
      { id: "fire", label: "篝火生食烤煮", image: "/sort/shi-fire.jpg" },
      { id: "pottery", label: "陶釜陶罐", image: "/sort/shi-pottery.jpg" },
      { id: "wood_stove", label: "土灶柴火铁锅", image: "/sort/shi-wood-stove.jpg" },
      { id: "gas", label: "液化气灶", image: "/sort/shi-gas.jpg" },
      { id: "rice_cooker", label: "电饭煲", image: "/sort/shi-rice-cooker.jpg" },
      { id: "auto_cook", label: "自动炒菜机", image: "/sort/shi-auto-cook.jpg" },
    ],
  },
  zhu: {
    theme: "zhu",
    themeLabel: "住",
    title: "住所时光排序",
    order: ["cave", "thatch", "adobe", "brick", "highrise", "smart"],
    cards: [
      { id: "cave", label: "山洞巢穴", image: "/sort/zhu-cave.jpg" },
      { id: "thatch", label: "茅草屋", image: "/sort/zhu-thatch.jpg" },
      { id: "adobe", label: "土坯房", image: "/sort/zhu-adobe.jpg" },
      { id: "brick", label: "砖瓦平房", image: "/sort/zhu-brick.jpg" },
      { id: "highrise", label: "高层楼房", image: "/sort/zhu-highrise.jpg" },
      { id: "smart", label: "高楼智能家居", image: "/sort/zhu-smart.jpg" },
    ],
  },
};

export function getSortPuzzle(theme: SortTheme): SortPuzzle {
  return SORT_PUZZLES[theme];
}

export function isSortCorrect(theme: SortTheme, ids: string[]): boolean {
  const order = SORT_PUZZLES[theme].order;
  if (ids.length !== order.length) return false;
  return ids.every((id, i) => id === order[i]);
}
