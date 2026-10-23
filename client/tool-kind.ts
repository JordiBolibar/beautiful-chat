import type { ToolCallKind } from "../shared/contracts";

/**
 * Facts every card and the grouping classifier read from a tool call's detail.
 * The renderer used to derive these inline; the transformer needs the same
 * derivation to decide grouping, so both now share this one source of truth.
 */
export interface ToolCallFacts {
  /** `detail.type`, lowercased. Empty when the detail carries no type. */
  detailType: string;
  /** The call's input record, whichever key it arrived under. */
  input: Record<string, unknown>;
  filePath?: string;
  command?: string;
}

export function readToolCallFacts(detail: Record<string, unknown>): ToolCallFacts {
  const input = (
    detail.input && typeof detail.input === "object"
      ? detail.input
      : detail.arguments && typeof detail.arguments === "object"
        ? detail.arguments
        : detail.args && typeof detail.args === "object"
          ? detail.args
          : {}
  ) as Record<string, unknown>;
  const filePath =
    (typeof detail.filePath === "string" ? detail.filePath : undefined) ||
    (typeof input.path === "string" ? input.path : undefined) ||
    (typeof input.filePath === "string" ? input.filePath : undefined) ||
    (typeof detail.path === "string" ? detail.path : undefined);
  const command =
    (typeof detail.command === "string" ? detail.command : undefined) ||
    (typeof input.command === "string" ? input.command : undefined) ||
    (typeof detail.input === "string" ? detail.input : undefined);
  const detailType = typeof detail.type === "string" ? detail.type.toLowerCase() : "";
  return { detailType, input, filePath, command };
}

/**
 * The kind of card a tool call draws. One function decides for both the
 * renderer (which card to build) and the transformer (groupable or standalone),
 * so the two can never drift apart. An unmapped tool answers `null`: the
 * renderer falls back to the "bash" card but keeps the tool's own name as its
 * title, exactly as it always did.
 */
export function toolKindFromFacts(rawName: string, facts: ToolCallFacts): ToolCallKind | null {
  const { detailType, filePath, command } = facts;

  const isGitHubTool =
    rawName === "github" ||
    detailType === "github" ||
    filePath === "xd://github" ||
    filePath?.startsWith("xd://github/") === true;
  const isGitCommand =
    rawName === "git" ||
    detailType === "git" ||
    /^\s*git(?:\.exe)?(?:\s|$)/i.test(command ?? "");

  if (isGitHubTool) return "github";
  if (isGitCommand) return "git";
  if (rawName === "read" || detailType === "read") return "read";
  if (rawName === "write" || detailType === "write") return "write";
  if (rawName === "edit" || detailType === "edit") return "edit";
  if (rawName === "bash" || rawName === "shell" || detailType === "shell") {
    return rawName === "shell" || detailType === "shell" ? "shell" : "bash";
  }
  if (rawName === "thinking") return "thinking";
  if (
    rawName === "create_agent" ||
    rawName === "list_providers" ||
    rawName === "list_models" ||
    rawName === "get_agent_activity" ||
    rawName === "send_agent_prompt" ||
    rawName === "get_agent_status"
  ) {
    return "paseo";
  }
  if (rawName.startsWith("mcp__") || rawName === "mcp") return "mcp";
  if (rawName === "ask") return "ask";
  if (rawName === "hub") return "hub";
  if (rawName === "eval") return "eval";
  if (rawName === "task") return "task";
  return null;
}

/**
 * Which kinds fold into a group card. `hub` stays standalone: grouped members
 * never mount their effect, and that effect is the only source of the
 * running-jobs dock. `github`, `ask`, `task`, `thinking` and file edits are
 * content the reader wants to see on their own.
 */
export function isGroupableToolKind(kind: ToolCallKind): boolean {
  return (
    kind === "bash" ||
    kind === "shell" ||
    kind === "git" ||
    kind === "read" ||
    kind === "mcp" ||
    kind === "eval" ||
    kind === "paseo"
  );
}
