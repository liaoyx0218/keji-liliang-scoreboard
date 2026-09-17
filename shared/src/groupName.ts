const DIGITS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

export function seqToGroupName(seq: number): string {
  if (!Number.isInteger(seq) || seq < 1 || seq > 99) {
    throw new Error(`seq out of range: ${seq}`);
  }
  if (seq < 10) return `组${DIGITS[seq]}`;
  if (seq === 10) return "组十";
  if (seq < 20) return `组十${DIGITS[seq - 10]}`;
  const tens = Math.floor(seq / 10);
  const ones = seq % 10;
  return ones === 0 ? `组${DIGITS[tens]}十` : `组${DIGITS[tens]}十${DIGITS[ones]}`;
}
