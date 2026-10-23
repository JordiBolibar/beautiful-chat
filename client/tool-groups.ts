import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * Grouping of consecutive "work" tool calls into one card.
 *
 * The host gives a timeline transformer exactly one item per call — no
 * neighbors, no position, no agent id — so the grouping is built here, in the
 * same module-store style `timeline-tail.ts` uses. Every transformer lives in
 * one module (`index.client.tsx`), so they all share this store:
 *
 * - boundary transformers (reasoning, todo, user, assistant, error, compaction)
 *   and standalone tool kinds call `closeToolGroup`;
 * - a groupable tool call calls `noteGroupedToolCall`, which decides its role
 *   once per call id and records its payload.
 *
 * A tool call's content changes while it streams (running -> completed), so the
 * transform re-runs; the role is therefore memoized per call id, and re-runs
 * only refresh the payload.
 *
 * The store holds references to the payloads the transform created, not copies,
 * so a long session does not double its memory.
 */

/** The payload a grouped card renders; the same fields the timeline item data carries. */
export interface ToolGroupMemberPayload {
  name: string;
  status: string;
  detail?: Record<string, unknown>;
  error?: string | null;
  phase?: string;
}

export interface ToolGroupRole {
  role: "head" | "member";
  groupId: string;
}

interface MemberEntry {
  callId: string;
  payload: ToolGroupMemberPayload;
  /** Reported by the row renderer when it mounts; unknown until then. */
  agentId?: string;
  atMs?: number;
}

interface Group {
  headCallId: string;
  /** The head is `members[0]`; later calls append. */
  members: MemberEntry[];
  headAgentId?: string;
  headAtMs?: number;
  /** True once a boundary item ended the run: no more members can join. */
  closed: boolean;
  version: number;
}

const assignments = new Map<string, ToolGroupRole>();
const groups = new Map<string, Group>();
let openGroupId: string | null = null;

/**
 * The stores hold references, not copies, so a session's cost is the map
 * entries themselves. Past the cap the oldest run's entries drop: its rows
 * fall back to their own standalone cards, which is the honest degradation.
 */
const GROUP_STORE_LIMIT = 2000;

function evictOldest(): void {
  if (assignments.size <= GROUP_STORE_LIMIT) return;
  const oldest = assignments.keys().next().value;
  if (oldest === undefined) return;
  // An evicted run re-transforms into fresh assignments: an evicted call
  // whose transform runs again opens a new, one-member group and renders its
  // own plain card — the same honest degradation eviction intends. Evicting
  // the open group also drops the pointer, so a still-streaming run starts a
  // fresh group instead of joining a dead id.
  const group = groups.get(oldest);
  if (group) {
    for (const entry of group.members) assignments.delete(entry.callId);
  }
  assignments.delete(oldest);
  groups.delete(oldest);
  if (openGroupId === oldest) openGroupId = null;
}

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

let notifyScheduled = false;

/**
 * The transform can run inside the host's render pass, so listeners are told
 * in a microtask, never synchronously from `transform`.
 */
function scheduleNotify(): void {
  if (notifyScheduled) return;
  notifyScheduled = true;
  const deliver = (): void => {
    notifyScheduled = false;
    notify();
  };
  if (typeof globalThis.queueMicrotask === "function") globalThis.queueMicrotask(deliver);
  else void Promise.resolve().then(deliver);
}

/** Ends the run of groupable calls. Called by every boundary transformer. */
export function closeToolGroup(): void {
  // The closed flag is the only reliable "the run is over" signal: no plugin
  // code can see the future, but a boundary item proves no more members will
  // join, which is what the model summary waits for.
  if (openGroupId !== null) {
    const group = groups.get(openGroupId);
    if (group && !group.closed) {
      group.closed = true;
      group.version++;
      scheduleNotify();
    }
  }
  openGroupId = null;
}

/**
 * Assigns the call's role (once, memoized by call id) and records its payload.
 * The first groupable call after a boundary opens the group and is its head;
 * the calls that follow until the next boundary are its members.
 */
export function noteGroupedToolCall(
  callId: string,
  payload: ToolGroupMemberPayload,
): ToolGroupRole {
  let assignment = assignments.get(callId);
  if (!assignment) {
    if (openGroupId === null) {
      openGroupId = callId;
      assignment = { role: "head", groupId: callId };
      groups.set(callId, { headCallId: callId, members: [], closed: false, version: 0 });
    } else {
      assignment = { role: "member", groupId: openGroupId };
    }
    assignments.set(callId, assignment);
    evictOldest();
  }
  const group = groups.get(assignment.groupId);
  if (group) {
    const existing = group.members.find((entry) => entry.callId === callId);
    if (existing) {
      existing.payload = payload;
    } else {
      group.members.push({ callId, payload });
    }
    group.version++;
    scheduleNotify();
  }
  return assignment;
}

/**
 * A row reports its agent and timestamp when it mounts. The renderer props
 * carry both, while the transform carries neither, so this is where the two
 * checks run that keep history pages and parallel agents honest.
 */
export function reportToolGroupRow(
  groupId: string,
  callId: string,
  agentId: string,
  atMs: number,
  isHead: boolean,
): void {
  const group = groups.get(groupId);
  if (!group) return;
  if (isHead) {
    group.headAgentId = agentId;
    group.headAtMs = atMs;
  }
  const entry = group.members.find((candidate) => candidate.callId === callId);
  if (entry) {
    entry.agentId = agentId;
    entry.atMs = atMs;
  }
  group.version++;
  scheduleNotify();
}

/**
 * True only on positive confirmation: the row reported the same agent as the
 * head, and a timestamp that is not older than the head's. An entry that has
 * not reported yet — a row that never mounted, another chat streaming through
 * the same module store, an older history page — does NOT count, because
 * nothing can tell it apart from a foreign call until its row mounts. The
 * cost is a one-tick flash while a live member reports; the gain is that a
 * group card never draws, counts, or summarizes a call that is not its own.
 */
function isAttached(group: Group, entry: MemberEntry): boolean {
  if (entry.callId === group.headCallId) return true;
  if (group.headAgentId === undefined || group.headAtMs === undefined) return false;
  if (entry.agentId === undefined || entry.atMs === undefined) return false;
  if (entry.agentId !== group.headAgentId) return false;
  if (entry.atMs < group.headAtMs) return false;
  return true;
}

export interface AttachedToolGroupMember {
  callId: string;
  payload: ToolGroupMemberPayload;
}

/** The members a head card may draw, head first. Unconfirmed rows are left out. */
export function getAttachedToolGroupMembers(groupId: string): AttachedToolGroupMember[] {
  const group = groups.get(groupId);
  if (!group) return [];
  return group.members
    .filter((entry) => isAttached(group, entry))
    .map((entry) => ({ callId: entry.callId, payload: entry.payload }));
}

/** True once a boundary item ended the run: the member set cannot grow. */
export function isToolGroupClosed(groupId: string): boolean {
  return groups.get(groupId)?.closed ?? false;
}

/** True while this member row should fold into its group's head card. */
export function isToolGroupMemberAttached(groupId: string, callId: string): boolean {
  const group = groups.get(groupId);
  if (!group) return false;
  const entry = group.members.find((candidate) => candidate.callId === callId);
  if (!entry) return false;
  return isAttached(group, entry);
}

function groupVersion(groupId: string): number {
  return groups.get(groupId)?.version ?? 0;
}

/**
 * Re-renders the subscriber whenever the store changes. The subscribe function
 * is a stable module-level reference, and the snapshot is a version number,
 * so React resubscribes only when the group id changes and never loops on an
 * unstable object reference.
 */
const subscribeToolGroups = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function useToolGroupVersion(groupId: string | undefined): number {
  const getSnapshot = useCallback(
    () => (groupId === undefined ? 0 : groupVersion(groupId)),
    [groupId],
  );
  return useSyncExternalStore(subscribeToolGroups, getSnapshot, getSnapshot);
}

/**
 * A grouped row's side of the contract: report on mount (or when the row's
 * identity changes), subscribe to the store, and re-read attachment whenever
 * it moves. A head is always attached to its own group; a member only once
 * positively confirmed.
 */
export function useToolGroupRow(
  groupId: string | undefined,
  callId: string | undefined,
  agentId: string,
  atMs: number,
  isHead: boolean,
): boolean {
  useEffect(() => {
    if (groupId === undefined || callId === undefined) return;
    reportToolGroupRow(groupId, callId, agentId, atMs, isHead);
  }, [groupId, callId, agentId, atMs, isHead]);
  useToolGroupVersion(groupId);
  return (
    groupId !== undefined &&
    callId !== undefined &&
    (isHead || isToolGroupMemberAttached(groupId, callId))
  );
}

