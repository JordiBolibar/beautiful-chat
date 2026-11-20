import type { PluginTheme } from "@getpaseo/plugin";
import { DEFAULT_PREFERENCES, type EnhancerPreferences, ACCENT_PRESETS } from "../preferences";

export type PluginSurfaceColors = PluginTheme["colors"];

/**
 * Corner rounding, in three tiers: outer card, inner block, small chip. Each
 * tier steps down so a block nested in a card reads as inside it rather than
 * as a second card. Components reference these rather than literals, so the
 * tier a surface belongs to is stated once and stays consistent.
 */
export const radius = { card: 12, block: 8, chip: 5 } as const;

/**
 * One family name per stack, never a comma-separated CSS list. React Native's
 * `fontFamily` takes a single family; a list is not parsed and the whole
 * declaration is dropped, which silently leaves every surface on the host
 * default. Fallbacks live in the `@font-face` `src` chain instead, so these
 * names always resolve to something.
 */
export const fontMono = "Paseo System Mono";

/**
 * Same family as `fontMono`: this checkout aliases the code font to the host's
 * system monospace (see `embed-fonts.ts`) instead of the embedded ligature
 * cut, so the "code glyphs" preference no longer changes the face.
 */
export const fontCode = "Paseo System Mono";
export const fontUi = "OMP Inter";

export interface ExtendedThemeTokens {
  isDark: boolean;
  fontMono: string;
  fontCode: string;
  fontUi: string;

  // Surfaces
  surface0: string;
  surface1: string;
  surface2: string;
  surfaceCode: string;
  // Translucent variants, for surfaces that blur what sits behind them.
  surfaceGlass: string;
  surfaceCodeGlass: string;

  // Foreground
  foreground: string;
  foregroundMuted: string;
  foregroundSubtle: string;

  // Accent: primary action, selection, and running state only
  accent: string;
  accentForeground: string;
  accentBg: string;
  // The agent at work: thinking, running and active states. Orange, the hue of
  // the Claude and Mistral logos, so the accent stays for actions and for the
  // user's own turn.
  llm: string;
  llmBg: string;
  // The authored turn sits on a raised theme surface, exactly as the native
  // stream draws it, with a soft wash of the accent hue: it reads as the
  // user's voice without taking the full accent.
  userSurface: string;
  userBorder: string;
  userText: string;
  userTextMuted: string;

  // Semantic status: failure, risk, and diff markers only
  success: string;
  successBg: string;
  successBorder: string;

  warning: string;
  warningBg: string;
  warningBorder: string;

  danger: string;
  dangerBg: string;
  dangerBorder: string;

  // Borders
  border: string;
  borderSubtle: string;
  boxShadow: {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
  };

  // Syntax
  syntax: {
    keyword: string;
    string: string;
    number: string;
    comment: string;
    property: string;
    function: string;
    diffAddBg: string;
    diffAddMarker: string;
    diffRemoveBg: string;
    diffRemoveMarker: string;
    hunk: string;
  };

  // Terminal surfaces (shell cards and command output), on the Atom One Dark
  // palette: One Dark on dark themes, One Light on light ones.
  terminal: {
    body: string;
    prompt: string;
    command: string;
    subcommand: string;
    operator: string;
    flag: string;
    string: string;
    number: string;
    path: string;
    url: string;
    comment: string;
    success: string;
    danger: string;
    warning: string;
  };
}

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseColor(color: string): Rgba | null {
  const value = color.trim();
  if (value.startsWith("#")) {
    let hex = value.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      hex = [...hex].map((c) => c + c).join("");
    }
    if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) return null;
    const channel = (i: number) => Number.parseInt(hex.slice(i, i + 2), 16);
    return {
      r: channel(0),
      g: channel(2),
      b: channel(4),
      a: hex.length === 8 ? channel(6) / 255 : 1,
    };
  }
  const body = /^rgba?\(([^)]+)\)$/i.exec(value)?.[1];
  if (!body) return null;
  const [r, g, b, a = 1] = body
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number);
  if (r === undefined || g === undefined || b === undefined) return null;
  if ([r, g, b, a].some(Number.isNaN)) return null;
  return { r, g, b, a };
}

/** `color` at `alpha` opacity, multiplied with any alpha it already has. Unparseable colours pass through. */
export function withAlpha(color: string, alpha: number): string {
  const rgba = parseColor(color);
  if (!rgba) return color;
  const a = Number((rgba.a * alpha).toFixed(3));
  return `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${a})`;
}

/** Linear blend from `from` towards `to`; `t = 0` returns `from`. */
export function mix(from: string, to: string, t: number): string {
  const a = parseColor(from);
  const b = parseColor(to);
  if (!a || !b) return from;
  const channel = (x: number, y: number) =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(a.r, b.r)}${channel(a.g, b.g)}${channel(a.b, b.b)}`;
}

function isDarkSurface(color: string): boolean {
  const rgba = parseColor(color);
  if (!rgba) return true;
  return (0.299 * rgba.r + 0.587 * rgba.g + 0.114 * rgba.b) / 255 < 0.5;
}

// PluginTheme only carries six colours, so every other surface is derived from
// the host foreground/accent with alpha. That keeps the plugin on-theme for any
// Paseo theme instead of hard-coding a palette that matches only one of them.
export function buildThemeTokens(
  colors: PluginSurfaceColors,
  preferences: EnhancerPreferences = DEFAULT_PREFERENCES,
): ExtendedThemeTokens {
  const isDark = isDarkSurface(colors.surface0);
  const fg = colors.foreground;
  const accent = ACCENT_PRESETS[preferences.accent] ?? colors.accent;
  // Hue-carrying base for surfaces: the accent's hue at the foreground's
  // lightness. Cards, borders and washes built from it take a soft tint of
  // the theme's colour instead of a neutral grey, on any Paseo theme.
  const wash = mix(fg, accent, isDark ? 0.55 : 0.45);
  const success = isDark ? "#4cb782" : "#1f8a5b";
  const warning = isDark ? "#d9a53f" : "#a36a00";
  const llm = isDark ? "#f0875a" : "#c8501f";
  const danger = colors.statusDanger;
  const tint = isDark ? 0.1 : 0.08;
  const edge = isDark ? 0.22 : 0.18;

  return {
    isDark,
    fontMono,
    fontCode: preferences.codeFont === "plain" ? fontMono : fontCode,
    fontUi: preferences.uiFont === "system" ? "System" : fontUi,

    surface0: colors.surface0,
    surface1: withAlpha(wash, isDark ? 0.04 : 0.03),
    surface2: withAlpha(wash, isDark ? 0.075 : 0.055),
    surfaceCode: isDark
      ? withAlpha(mix("#000000", accent, 0.35), 0.24)
      : withAlpha(wash, 0.04),
    // Translucent so the blur behind them reads, but still dense enough to
    // keep text legible over whatever scrolls past.
    surfaceGlass: preferences.frostedGlass
      ? withAlpha(colors.surface0, isDark ? 0.52 : 0.64)
      : colors.surface0,
    surfaceCodeGlass: preferences.frostedGlass
      ? isDark
        ? withAlpha(mix("#000000", accent, 0.35), 0.34)
        : withAlpha(wash, 0.05)
      : isDark
        ? withAlpha(mix("#000000", accent, 0.35), 0.24)
        : withAlpha(wash, 0.04),

    foreground: fg,
    foregroundMuted: colors.foregroundMuted,
    foregroundSubtle: withAlpha(colors.foregroundMuted, 0.7),

    accent,
    accentForeground: colors.accentForeground,
    accentBg: withAlpha(accent, isDark ? 0.14 : 0.1),
    llm,
    llmBg: withAlpha(llm, isDark ? 0.14 : 0.1),
    // The user's turn takes the accent hue itself, so it stands out from the
    // grey agent surfaces. The agent's own activity is orange (`llm`).
    userSurface: withAlpha(accent, isDark ? 0.17 : 0.1),
    userBorder: withAlpha(accent, isDark ? 0.4 : 0.3),
    userText: fg,
    userTextMuted: colors.foregroundMuted,

    success,
    successBg: withAlpha(success, tint),
    successBorder: withAlpha(success, edge),

    warning,
    warningBg: withAlpha(warning, tint),
    warningBorder: withAlpha(warning, edge),

    danger,
    dangerBg: withAlpha(danger, tint),
    dangerBorder: withAlpha(danger, edge),

    border: withAlpha(wash, isDark ? 0.11 : 0.12),
    borderSubtle: withAlpha(wash, 0.07),
    boxShadow: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.12 : 0.08,
      shadowRadius: 5,
      elevation: 1,
    },

    // Atom One Dark / One Light (github.com/atom/one), the same palette the
    // user's editor uses. Code blocks and shell output read as one set.
    syntax: {
      keyword: isDark ? "#c678dd" : "#a626a4", // purple
      string: isDark ? "#98c379" : "#50a14f", // green
      number: isDark ? "#d19a66" : "#986801", // orange
      comment: isDark ? "#5c6370" : "#a0a1a7", // comment grey
      property: isDark ? "#e06c75" : "#e45649", // red
      function: isDark ? "#61afef" : "#4078f2", // blue
      diffAddBg: withAlpha(success, tint),
      diffAddMarker: success,
      diffRemoveBg: withAlpha(danger, tint),
      diffRemoveMarker: danger,
      hunk: withAlpha(colors.foregroundMuted, 0.7),
    },

    // Atom One Dark / One Light, matching the syntax palette above so shell
    // cards and code blocks read as one set.
    terminal: isDark
      ? {
          body: "#abb2bf", // foreground
          prompt: "#5c6370", // comment grey
          command: "#c678dd", // purple
          subcommand: "#e5c07b", // yellow
          operator: "#e06c75", // red
          flag: "#56b6c2", // cyan
          string: "#98c379", // green
          number: "#d19a66", // orange
          path: "#61afef", // blue
          url: "#56b6c2", // cyan
          comment: "#5c6370", // comment grey
          success: "#98c379",
          danger: "#e06c75",
          warning: "#e5c07b",
        }
      : {
          body: "#383a42", // foreground
          prompt: "#a0a1a7", // comment grey
          command: "#a626a4", // purple
          subcommand: "#c18401", // yellow
          operator: "#e45649", // red
          flag: "#0184bc", // cyan
          string: "#50a14f", // green
          number: "#986801", // orange
          path: "#4078f2", // blue
          url: "#0184bc", // cyan
          comment: "#a0a1a7", // comment grey
          success: "#50a14f",
          danger: "#e45649",
          warning: "#c18401",
        },
  };
}
