const DIGITS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

function seqToChineseOrdinal(n: number): string {
  if (n < 10) return DIGITS[n];
  if (n === 10) return "十";
  if (n < 20) return `十${DIGITS[n - 10]}`;
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones === 0 ? `${DIGITS[tens]}十` : `${DIGITS[tens]}十${DIGITS[ones]}`;
}

/** 衣食住主题与队名（每主题 3 组：溯源 / 赋能 / 畅想） */
export type SortTheme = "yi" | "shi" | "zhu";

const THEME_META: { key: SortTheme; label: string; teams: [string, string, string] }[] = [
  { key: "yi", label: "衣", teams: ["时光溯源队", "科技赋能队", "生活畅想队"] },
  { key: "shi", label: "食", teams: ["烟火寻踪队", "科技美味队", "舌尖畅想队"] },
  { key: "zhu", label: "住", teams: ["安居寻迹队", "科技筑家队", "家园畅想队"] },
];

export function seqToTheme(seq: number): SortTheme {
  if (!Number.isInteger(seq) || seq < 1) throw new Error(`seq out of range: ${seq}`);
  return THEME_META[Math.floor((seq - 1) / 3) % 3].key;
}

export function seqToThemeLabel(seq: number): string {
  return THEME_META[Math.floor((seq - 1) / 3) % 3].label;
}

/** 扫码顺序：衣×3 → 食×3 → 住×3；如 `"衣"时光溯源队` */
export function seqToGroupName(seq: number): string {
  if (!Number.isInteger(seq) || seq < 1 || seq > 99) {
    throw new Error(`seq out of range: ${seq}`);
  }
  return `"${seqToThemeLabel(seq)}"${seqToTeamLabel(seq)}`;
}

/** 队名不含衣/食/住前缀，适合泡泡等紧凑展示 */
export function seqToTeamLabel(seq: number): string {
  if (!Number.isInteger(seq) || seq < 1 || seq > 99) {
    throw new Error(`seq out of range: ${seq}`);
  }
  const themeIdx = Math.floor((seq - 1) / 3) % 3;
  const slot = (seq - 1) % 3;
  const round = Math.floor((seq - 1) / 9);
  const meta = THEME_META[themeIdx];
  if (round === 0) return meta.teams[slot];
  const ordinal = round * 3 + slot + 1;
  return `${seqToChineseOrdinal(ordinal)}队`;
}

/** Strip `"衣"` / `"食"` / `"住"` prefix from a full group name. */
export function stripThemePrefix(name: string): string {
  return name.replace(/^"[衣食住]"/, "");
}
