// 写作中心外观预设：字体、字号、背景主题。选择持久化到 localStorage。

export type FontPreset = { key: string; label: string; stack: string };
export type BgPreset = { key: string; label: string; bg: string; text: string; swatch: string };
export type SizePreset = { key: string; label: string; px: number };
export type StealthSkin = "off" | "wiki" | "csdn" | "csdn-dark";

export const FONTS: FontPreset[] = [
  { key: "song", label: "宋体", stack: '"Songti SC","STSong","SimSun","Noto Serif SC",Georgia,serif' },
  { key: "kai", label: "楷体", stack: '"Kaiti SC","STKaiti","KaiTi","BiauKai",serif' },
  { key: "hei", label: "黑体", stack: '"PingFang SC","Microsoft YaHei","Hiragino Sans GB","Heiti SC",sans-serif' },
  { key: "fang", label: "仿宋", stack: '"FangSong","STFangsong","FangSong_GB2312",serif' },
  { key: "mono", label: "等宽", stack: '"SFMono-Regular",Consolas,"Noto Sans Mono CJK SC",monospace' },
];

export const SIZES: SizePreset[] = [
  { key: "s", label: "小", px: 15 },
  { key: "m", label: "中", px: 17 },
  { key: "l", label: "大", px: 19 },
];

export const BGS: BgPreset[] = [
  { key: "paper", label: "米白", bg: "#fbf8f1", text: "#2b2a28", swatch: "#fbf8f1" },
  { key: "white", label: "纯白", bg: "#ffffff", text: "#2b2a28", swatch: "#ffffff" },
  { key: "green", label: "护眼", bg: "#e7efe6", text: "#22321f", swatch: "#e7efe6" },
  { key: "sepia", label: "暖褐", bg: "#f4ecd8", text: "#433422", swatch: "#f4ecd8" },
  { key: "night", label: "夜间", bg: "#262a2e", text: "#d9d5cd", swatch: "#262a2e" },
];

export function loadPref(key: string, fallback: string): string {
  return localStorage.getItem("nf_" + key) ?? fallback;
}

export function savePref(key: string, value: string) {
  localStorage.setItem("nf_" + key, value);
}

export function findFont(key: string): FontPreset {
  return FONTS.find((f) => f.key === key) ?? FONTS[0];
}
export function findSize(key: string): SizePreset {
  return SIZES.find((s) => s.key === key) ?? SIZES[1];
}
export function findBg(key: string): BgPreset {
  return BGS.find((b) => b.key === key) ?? BGS[0];
}

// 伪装（阅读）模式：把整个界面伪装成枯燥的内部文档，降低摸鱼被发现的概率。
// 隐藏大标题/品牌色、压小字号、去掉写作入口，仅保留资料本体。
const STEALTH_KEY = "nf_stealth";
const LAST_STEALTH_KEY = "nf_stealth_last_skin";

// CSDN 有明暗两个变体，共用同一套伪装文案与版式，只有配色不同。
export function isCsdnSkin(skin: StealthSkin): boolean {
  return skin === "csdn" || skin === "csdn-dark";
}

export function loadSkin(): StealthSkin {
  const value = localStorage.getItem(STEALTH_KEY);
  if (value === "csdn" || value === "csdn-dark" || value === "wiki" || value === "off") {
    return value;
  }
  if (value === "on") {
    return "wiki";
  }
  return "off";
}

export function saveSkin(skin: StealthSkin) {
  localStorage.setItem(STEALTH_KEY, skin);
  if (skin !== "off") {
    localStorage.setItem(LAST_STEALTH_KEY, skin);
  }
}

export function loadLastSkin(): Exclude<StealthSkin, "off"> {
  const value = localStorage.getItem(LAST_STEALTH_KEY);
  if (value === "csdn" || value === "csdn-dark") {
    return value;
  }
  return "wiki";
}

export function saveLastSkin(skin: Exclude<StealthSkin, "off">) {
  localStorage.setItem(LAST_STEALTH_KEY, skin);
}

export function loadStealth(): boolean {
  return loadSkin() !== "off";
}

export function saveStealth(on: boolean) {
  saveSkin(on ? "wiki" : "off");
}
