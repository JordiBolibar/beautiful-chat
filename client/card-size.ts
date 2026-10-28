import type { ToolCalloutData } from "../shared/contracts";

/**
 * The most lines a body may have to count as small. The preference
 * `autoExpandSmallCards` keeps such bodies open when the call completes,
 * instead of folding the card the way every completed card folds by default.
 */
const SMALL_BODY_LINES = 5;

/**
 * Lines in a body, with the blank tail trimmed: a command that ends with a
 * newline or two prints no extra content, so those lines do not count.
 */
function countBodyLines(text: string): number {
  const trimmed = text.replace(/[\s\u0000]+$/, "");
  if (!trimmed) return 0;
  return trimmed.split("\n").length;
}

/**
 * True when the card's body is small enough to stay open under the
 * `autoExpandSmallCards` preference: a shell call with few output lines, an
 * edit with few diff lines. Only bodies the card actually measures count —
 * an edit without a diff string is never small, because its body cannot be
 * sized. Grouped members do not ask: the group card carries them.
 */
export function isSmallCardBody(data: ToolCalloutData): boolean {
  if (data.tool === "bash" || data.tool === "shell") {
    return countBodyLines(data.output ?? "") <= SMALL_BODY_LINES;
  }
  if (data.tool === "edit") {
    return typeof data.diff === "string" && countBodyLines(data.diff) <= SMALL_BODY_LINES;
  }
  return false;
}
