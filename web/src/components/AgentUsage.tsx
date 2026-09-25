import type { AgentUsage as Usage } from "../types";
import { money, tokens } from "../lib";

export function AgentUsage({ usage }: { usage: Usage }) {
  return (
    <div
      className="agent-quantity"
      title={`${usage.tokens.toLocaleString("en-US")} tokens${usage.model ? ` · ${usage.model}` : ""}`}
    >
      <span>Agent Usage</span>
      <strong>{tokens(usage.tokens)}</strong>
      <small>
        {money(usage.cost)} <span>reported cost</span>
      </small>
    </div>
  );
}
export function AgentDetails({ notes }: { notes: string }) {
  return notes ? (
    <details className="agent-entry-details">
      <summary>Usage details</summary>
      <div>{notes}</div>
    </details>
  ) : null;
}
