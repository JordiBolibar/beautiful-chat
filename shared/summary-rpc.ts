import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/**
 * A one-line, plain-words summary of a finished group of work tool calls.
 *
 * The heuristic in the group card names the action type ("checked git state"),
 * but only a model can say what the run was for. The daemon side owns the
 * network, so the client sends the run's items and gets back a single line
 * from a small Mistral model, cached on disk so a finished group never asks
 * twice.
 */
export const summarizeRunRpc = defineRpc({
  name: "summarize.run",
  input: z.object({
    /** One plain description per grouped call, in run order. */
    actions: z.array(z.string()).min(1),
  }),
  output: z.object({
    summary: z.string().nullable(),
    error: z.string().nullable(),
  }),
});
