import { useEffect, useRef, useState } from "react";
import { useRpc } from "@getpaseo/plugin/client";
import type { ToolCalloutData } from "../shared/contracts";
import { summarizeRunRpc } from "../shared/summary-rpc";
import { useEnhancerPreferences } from "./preferences";
import { isToolGroupClosed } from "./tool-groups";

/**
 * The model-written line for a finished group of work calls.
 *
 * The card shows its heuristic line immediately (nothing waits on the
 * network), and asks the daemon-side RPC once the run has closed: a group
 * that is still streaming is not worth summarizing yet, and a single call
 * already has its own title. The answer is kept per group id for the
 * session, and the daemon keeps it on disk for longer, so scrolling back
 * costs nothing.
 *
 * The fetch is deliberately not cancelled on re-render or unmount: it is a
 * pure read whose answer lands in the session cache either way, and a
 * cancelled request would leave the group without its line until a reload
 * (the parent re-renders on every stream tick, so the request always
 * outlives one render pass).
 */
const summaries = new Map<string, string>();
/**
 * Groups already asked this session, also on failure: a remount (scrolling a
 * card out of the list and back) must not turn one failed ask into a retry
 * per scroll. The daemon disk cache carries successes across sessions.
 */
const askedGroups = new Set<string>();
const SUMMARY_LIMIT = 500;

export function useGroupModelSummary(
  groupId: string,
  members: ToolCalloutData[],
): string | undefined {
  const summarize = useRpc(summarizeRunRpc);
  const preferences = useEnhancerPreferences();
  const [summary, setSummary] = useState<string | undefined>(() => summaries.get(groupId));
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current || askedGroups.has(groupId) || summaries.has(groupId)) return;
    if (!preferences.modelGroupSummaries) return;
    // The ask waits for the store's closed flag: a boundary item after the
    // run is the only reliable proof that no more members will join, so the
    // model never labels half a run. A member still running also blocks it.
    if (!isToolGroupClosed(groupId)) return;
    if (members.some((member) => member.status === "running")) return;
    if (members.length < 2) return;

    asked.current = true;
    askedGroups.add(groupId);
    const actions = members.map((member) => member.title.replace(/^\$ /, ""));
    summarize({ actions })
      .then((result) => {
        if (!result.summary) return;
        summaries.set(groupId, result.summary);
        if (summaries.size > SUMMARY_LIMIT) {
          const oldest = summaries.keys().next().value;
          if (oldest !== undefined) summaries.delete(oldest);
        }
        setSummary(result.summary);
      })
      .catch(() => {
        // No line, no change: the heuristic stays.
      });
  }, [groupId, members, summarize, preferences.modelGroupSummaries]);

  return summary;
}
