import { useSyncExternalStore } from "react";

export const ACCENT_PRESETS = {
  host: undefined,
  jade: "#10b981",
  // Dimmed, desaturated cut of #8b5cf6 (same 262° hue): accent tints and
  // running states stay readable without the neon cast.
  violet: "#8a70b8",
  amber: "#f59e0b",
  rose: "#f43f5e",
} as const;

export type AccentPreset = keyof typeof ACCENT_PRESETS;
export type UiFontPreference = "inter" | "system";
export type CodeFontPreference = "code" | "plain";
export type MarkdownVariantPreference = "document" | "compact" | "terminal";

export interface EnhancerPreferences {
  accent: AccentPreset;
  uiFont: UiFontPreference;
  codeFont: CodeFontPreference;
  frostedGlass: boolean;
  /**
   * A light that follows the pointer across a card. Web and desktop only:
   * touch platforms have no hover, so the attribute is inert there.
   */
  pointerGlow: boolean;
  /**
   * Paseo maps a stream item to the plugin timeline item before any transformer
   * runs, and that mapping carries only the text. Pasted images therefore never
   * reach plugin code, so the enhanced bubble cannot draw them. Turning this off
   * hands prompts back to the host, whose own bubble still shows them.
   */
  enhancedUserBubble: boolean;
  /**
   * The Copy / Add to chat bar that follows a highlight. Web and desktop only:
   * iOS and Android route selection through the platform's own menu, which the
   * plugin cannot extend, so the toggle has no effect there.
   */
  selectionActions: boolean;
  /**
   * The plugin's own markdown rendering for assistant replies. Off hands the
   * turn back to Paseo's renderer, which is the safety valve: the plugin
   * cannot import the host markdown pipeline, so its version is a reasonable
   * subset rather than a superset.
   */
  assistantMarkdown: boolean;
  /**
   * Fold consecutive work tool calls (commands, reads, MCP calls, ...) into
   * one minimized card, like the host's own grouping. Reasoning, file edits,
   * asks, tasks and hub calls keep their standalone cards. Like
   * `assistantMarkdown`, the preference is read at transform time, so it
   * applies to new items; cached items keep their shape until a reload.
   */
  groupWorkCalls: boolean;
  /**
   * Keep small bodies open when the call completes: a shell card with five or
   * fewer output lines, an edit card with five or fewer diff lines. Off is the
   * old behaviour, every completed card folds. A card the reader folds by
   * hand stays folded either way.
   */
  autoExpandSmallCards: boolean;
  /**
   * The model-written one-liner for a finished group. The daemon sends the
   * run's command lines to the Mistral API to ask for it, so turning this
   * off keeps grouped commands on the machine; the rule-based line stays.
   */
  modelGroupSummaries: boolean;
  /** Which look the markdown renderer uses. */
  markdownVariant: MarkdownVariantPreference;
}

const STORAGE_KEY = "paseo/beautiful-chat/preferences/v1";

export const DEFAULT_PREFERENCES: Readonly<EnhancerPreferences> = {
  accent: "host",
  uiFont: "inter",
  codeFont: "code",
  frostedGlass: true,
  pointerGlow: true,
  enhancedUserBubble: true,
  selectionActions: true,
  assistantMarkdown: true,
  groupWorkCalls: true,
  autoExpandSmallCards: false,
  modelGroupSummaries: true,
  markdownVariant: "document",
};

const listeners = new Set<() => void>();

function storage(): Storage | undefined {
  const candidate = globalThis as typeof globalThis & { localStorage?: Storage };
  return candidate.localStorage;
}

function isAccentPreset(value: unknown): value is AccentPreset {
  return typeof value === "string" && value in ACCENT_PRESETS;
}

function loadPreferences(): EnhancerPreferences {
  try {
    const stored = storage()?.getItem(STORAGE_KEY);
    if (!stored) return { ...DEFAULT_PREFERENCES };
    const candidate = JSON.parse(stored) as Partial<EnhancerPreferences>;
    return {
      accent: isAccentPreset(candidate.accent) ? candidate.accent : DEFAULT_PREFERENCES.accent,
      uiFont: candidate.uiFont === "system" ? "system" : DEFAULT_PREFERENCES.uiFont,
      codeFont: candidate.codeFont === "plain" ? "plain" : DEFAULT_PREFERENCES.codeFont,
      frostedGlass:
        typeof candidate.frostedGlass === "boolean"
          ? candidate.frostedGlass
          : DEFAULT_PREFERENCES.frostedGlass,
      pointerGlow:
        typeof candidate.pointerGlow === "boolean"
          ? candidate.pointerGlow
          : DEFAULT_PREFERENCES.pointerGlow,
      enhancedUserBubble:
        typeof candidate.enhancedUserBubble === "boolean"
          ? candidate.enhancedUserBubble
          : DEFAULT_PREFERENCES.enhancedUserBubble,
      selectionActions:
        typeof candidate.selectionActions === "boolean"
          ? candidate.selectionActions
          : DEFAULT_PREFERENCES.selectionActions,
      assistantMarkdown:
        typeof candidate.assistantMarkdown === "boolean"
          ? candidate.assistantMarkdown
          : DEFAULT_PREFERENCES.assistantMarkdown,
      groupWorkCalls:
        typeof candidate.groupWorkCalls === "boolean"
          ? candidate.groupWorkCalls
          : DEFAULT_PREFERENCES.groupWorkCalls,
      autoExpandSmallCards:
        typeof candidate.autoExpandSmallCards === "boolean"
          ? candidate.autoExpandSmallCards
          : DEFAULT_PREFERENCES.autoExpandSmallCards,
      modelGroupSummaries:
        typeof candidate.modelGroupSummaries === "boolean"
          ? candidate.modelGroupSummaries
          : DEFAULT_PREFERENCES.modelGroupSummaries,
      markdownVariant:
        candidate.markdownVariant === "compact" || candidate.markdownVariant === "terminal"
          ? candidate.markdownVariant
          : DEFAULT_PREFERENCES.markdownVariant,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

let preferences = loadPreferences();

function publish(): void {
  for (const listener of listeners) listener();
}

export function getEnhancerPreferences(): EnhancerPreferences {
  return preferences;
}

/**
 * Notifies on every preference change, for surfaces outside React (the
 * composer pill) that must follow the settings page and the pill itself.
 * Returns the unsubscribe function.
 */
export function subscribeEnhancerPreferences(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateEnhancerPreferences(update: Partial<EnhancerPreferences>): void {
  preferences = { ...preferences, ...update };
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Browser storage can be disabled. Keep the change alive for this session.
  }
  publish();
}

export function resetEnhancerPreferences(): void {
  preferences = { ...DEFAULT_PREFERENCES };
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    // Keep the default session value if storage is unavailable.
  }
  publish();
}

export function useEnhancerPreferences(): EnhancerPreferences {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getEnhancerPreferences,
    getEnhancerPreferences,
  );
}
