/**
 * JUAI 统一配色：冰川蓝、银绿与靛蓝。
 *
 * 冰川蓝铺底、靛蓝主操作、银绿完成状态，辅以珊瑚、晴黄和浅紫。
 * CSS 变量（--jg-*）和 Ant Design 主题都从这里生成，样式文件里不再定义颜色。
 */
import { theme as antdTheme } from 'ant-design-vue';

export interface Palette {
  /** 页面底色 */
  bg: string;
  /** 卡片、表格、输入框等内容面 */
  surface: string;
  /** 弹窗、浮层 */
  elevated: string;
  /** 次级底色：标签、代码块、悬停 */
  subtle: string;
  /** 卡片标题条、表头 */
  cardHeader: string;
  text: string;
  secondary: string;
  muted: string;
  placeholder: string;
  /** 分隔线、卡片边缘 */
  line: string;
  /** 输入框等控件边框，需与 surface 有 3:1 对比 */
  border: string;
  /** 主操作填充色 */
  accent: string;
  accentHover: string;
  /** 主操作上的文字 */
  onAccent: string;
  /** 链接、选中项文字 */
  accentText: string;
  /** 选中项底色 */
  accentSoft: string;
  accentLine: string;
  /** 品牌标记和想考状态 */
  seal: string;
  sealSoft: string;
  ice: string;
  mint: string;
  mintSoft: string;
  mintText: string;
  mintInk: string;
  coral: string;
  coralSoft: string;
  lavender: string;
  lavenderSoft: string;
  sunshine: string;
  sunshineSoft: string;
  heading: string;
  error: string;
  errorBg: string;
  success: string;
  warning: string;
  shadow: string;
  overlayShadow: string;
}

export const LIGHT: Palette = {
  bg: '#f9fbfd',
  surface: '#ffffff',
  elevated: '#ffffff',
  subtle: '#f6f8fb',
  cardHeader: '#f1f7fb',
  text: '#203252',
  secondary: '#465d7b',
  muted: '#586d87',
  placeholder: '#617893',
  line: '#e0e7ef',
  border: '#7d96b5',
  accent: '#526790',
  accentHover: '#405579',
  onAccent: '#ffffff',
  accentText: '#526790',
  accentSoft: '#f3f5fa',
  accentLine: '#d4deed',
  seal: '#526790',
  sealSoft: '#f1f7fb',
  ice: '#f1f7fb',
  mint: '#dceee7',
  mintInk: '#203252',
  mintSoft: '#f7fbf9',
  mintText: '#386457',
  coral: '#8e5955',
  coralSoft: '#fdf5f2',
  lavender: '#746588',
  lavenderSoft: '#f8f6fc',
  sunshine: '#7c6a3b',
  sunshineSoft: '#fdfaf0',
  heading: '#3d5278',
  error: '#9b505c',
  errorBg: '#fcf4f5',
  success: '#387462',
  warning: '#7c6a3b',
  shadow: '0 3px 12px #5267900a',
  overlayShadow: '0 18px 48px #253f741c',
};

export const DARK: Palette = {
  bg: '#111e35',
  surface: '#192c47',
  elevated: '#223855',
  subtle: '#243a59',
  cardHeader: '#29394e',
  text: '#edf6ff',
  secondary: '#c2d4eb',
  muted: '#a7bfdc',
  placeholder: '#9fb6d2',
  line: '#35506f',
  border: '#6c8aaf',
  accent: '#b5c1de',
  accentHover: '#c8d2e7',
  onAccent: '#142748',
  accentText: '#bdcce7',
  accentSoft: '#2b384e',
  accentLine: '#53647d',
  seal: '#dceee7',
  sealSoft: '#2c3c40',
  ice: '#29394e',
  mint: '#dceee7',
  mintInk: '#203252',
  mintSoft: '#2c3c40',
  mintText: '#b8d8cd',
  coral: '#dec4bc',
  coralSoft: '#3d343d',
  lavender: '#cdc5df',
  lavenderSoft: '#33364a',
  sunshine: '#ded3b5',
  sunshineSoft: '#393b36',
  heading: '#d7e1f1',
  error: '#dfbcc5',
  errorBg: '#3d303d',
  success: '#aacfc0',
  warning: '#ded3b5',
  shadow: '0 3px 12px #030c1d26',
  overlayShadow: '0 18px 48px #030c1d66',
};

export const FONT_SANS =
  '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';
/** 标题用衬线字，系统自带，不额外下载字体。 */
export const FONT_SERIF =
  '"Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", "Hiragino Mincho ProN", "SimSun", serif';

const RADIUS = { card: '14px', control: '8px', tag: '6px' };

const kebab = (key: string) =>
  key.replaceAll(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** --jg-* 变量，挂在 <html> 上，弹窗等挂到 body 的浮层也能读到。 */
export function cssVariables(palette: Palette): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(palette))
    vars[`--jg-${kebab(key)}`] = value;
  return {
    ...vars,
    '--jg-font': FONT_SANS,
    '--jg-font-serif': FONT_SERIF,
    '--jg-radius': RADIUS.card,
    '--jg-control-radius': RADIUS.control,
    '--jg-tag-radius': RADIUS.tag,
    // 旧样式里的别名，统一指向同一套颜色。
    '--jg-heading-bg': palette.ice,
    '--jg-heading-line': palette.line,
    '--jg-sidebar-bg': palette.bg,
    '--explorer-ink': palette.text,
    '--explorer-muted': palette.muted,
    '--explorer-line': palette.line,
    '--explorer-accent': palette.accentText,
    '--explorer-soft': palette.accentSoft,
  };
}

export function antdThemeConfig(
  palette: Palette,
  dark: boolean,
  motion: boolean,
) {
  return {
    inherit: false,
    algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: palette.accent,
      colorInfo: palette.accentText,
      colorLink: palette.accentText,
      colorBgBase: palette.surface,
      colorBgLayout: palette.bg,
      colorBgContainer: palette.surface,
      colorBgElevated: palette.elevated,
      colorText: palette.text,
      colorTextSecondary: palette.secondary,
      colorTextPlaceholder: palette.placeholder,
      colorTextLightSolid: palette.onAccent,
      colorBorder: palette.border,
      colorBorderSecondary: palette.line,
      colorFillAlter: palette.subtle,
      colorError: palette.error,
      colorSuccess: palette.success,
      colorWarning: palette.warning,
      borderRadius: 8,
      borderRadiusLG: 14,
      controlHeight: 36,
      fontSize: 14,
      fontFamily: FONT_SANS,
      // Small controls (Segmented, Switch) use boxShadowTertiary; keep them flat.
      boxShadowTertiary: palette.shadow,
      boxShadowSecondary: palette.overlayShadow,
      motion,
    },
  };
}
