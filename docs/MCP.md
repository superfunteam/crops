# Crops for agents

Crops can bill clients for agent work. A time entry may carry **agent usage**: `{tokens, cost, model}` that the agent computes and reports itself. Crops does not meter tokens or call any model API. Billable entries are valued at hours × project rate **plus** the reported USD cost in Reports, Billing, and CSV export. See [API.md](API.md#agent-usage) for the field rules.

There are two ways to connect an agent:

- **MCP server** (`mcp/crops-mcp.mjs`): lets the agent list projects, run timers, log time, and report usage as tools.
- **Hooks**: have your agent host start and stop a timer automatically with `curl`, with no model involvement.

## Get a token

Sign in once and keep the session token private. Tokens last 30 days; `POST /api/auth/logout` with the token revokes it.

```sh
curl -s https://crops.wims.vc/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"you","password":"your-password"}'
```

The response is `{"token":"…","user":{…}}`. Copy the `token` value.

Instead of a token, the MCP server can take `CROPS_USERNAME` and `CROPS_PASSWORD`. It signs in on first use, keeps the token in memory, and signs in again if the session expires.

## MCP server

The server uses stdio JSON-RPC 2.0 with no dependencies beyond Node 22. Configure it with environment variables:

| Variable                            | Purpose                                                  |
| ----------------------------------- | -------------------------------------------------------- |
| `CROPS_URL`                         | Crops origin. Defaults to `https://crops.wims.vc`.       |
| `CROPS_TOKEN`                       | Bearer session token.                                    |
| `CROPS_USERNAME` / `CROPS_PASSWORD` | Used instead of a token; signs in via `/api/auth/login`. |

### Claude Code

```sh
claude mcp add crops \
  -e CROPS_URL=https://crops.wims.vc \
  -e CROPS_TOKEN=your-token \
  -- node /path/to/crops/mcp/crops-mcp.mjs
```

### Other MCP clients

```json
{
  "mcpServers": {
    "crops": {
      "command": "node",
      "args": ["/path/to/crops/mcp/crops-mcp.mjs"],
      "env": {
        "CROPS_URL": "https://crops.wims.vc",
        "CROPS_TOKEN": "your-token"
      }
    }
  }
}
```

From a checkout, `npm run mcp` starts the same server.

### Tools

| Tool                 | Arguments                                                                                              | Does                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `list_projects`      | `includeArchived?`                                                                                     | Teams with their clients and projects, including ids, billable flags, and rates.                                            |
| `current_timer`      | none                                                                                                   | The running timer, with project, client, and elapsed seconds.                                                               |
| `start_timer`        | `projectId`, `task?`, `notes?`, `billable?`, `agent?`                                                  | Starts a timer (stopping any other) dated today in local time.                                                              |
| `stop_timer`         | `agent?: {tokens, cost, model?}`                                                                       | Stops the running timer and optionally attaches usage.                                                                      |
| `log_time`           | `projectId`, `durationMinutes` or `durationSeconds`, `date?`, `task?`, `notes?`, `billable?`, `agent?` | Adds a completed entry.                                                                                                     |
| `report_agent_usage` | `entryId`, `tokens`, `cost`, `model?`, `mode?: "add" \| "set"`                                         | Adds usage to an entry's recorded usage (default), or replaces it. Uses the entry's version and retries a version conflict. |

`cost` is USD. The server rounds it to cents before sending. Every POST sends an `Idempotency-Key`, and a network retry reuses that key so it cannot record time twice. Tool failures, such as a locked invoiced entry, come back as `isError` results with the Crops error message.

## Claude Code hooks

Hooks track a session without the model doing anything. This script starts a timer when a session starts, resumes that entry when you send a prompt, and stops it when Claude finishes responding. On stop, it reports the session's cumulative tokens from the transcript and a cost estimate from rates you set. Because the usage is cumulative, each stop replaces the entry's usage. It calls the REST API with `curl` and uses `node` to read JSON.

Save this as `~/.claude/hooks/crops.sh` and run `chmod +x` on it:

```sh
#!/bin/sh
# Usage: crops.sh start|resume|stop. Claude Code passes hook JSON on stdin.
set -eu
: "${CROPS_URL:=https://crops.wims.vc}" "${CROPS_TOKEN:?}" "${CROPS_TEAM_ID:?}" "${CROPS_PROJECT_ID:?}"
export CROPS_TEAM_ID CROPS_PROJECT_ID
input=$(cat)
json() { node -e "const i=JSON.parse(require('fs').readFileSync(0,'utf8'));$1"; }
session=$(printf '%s' "$input" | json 'console.log(i.session_id)')
state="${TMPDIR:-/tmp}/crops-$session.entry"
api() { curl -sf -X POST "$CROPS_URL/api$1" -H "Authorization: Bearer $CROPS_TOKEN" \
  -H 'Content-Type: application/json' -H "Idempotency-Key: $(uuidgen)" -d "$2"; }
case "$1" in
start)
  body=$(node -e 'const d=new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,10);
    console.log(JSON.stringify({teamId:process.env.CROPS_TEAM_ID,projectId:process.env.CROPS_PROJECT_ID,date:d,task:"Agent",notes:"Claude Code session"}))')
  api /timer/start "$body" | json 'console.log(i.entry.id)' >"$state" ;;
resume)
  [ -s "$state" ] || exit 0
  api /timer/start "{\"teamId\":\"$CROPS_TEAM_ID\",\"entryId\":\"$(cat "$state")\"}" >/dev/null ;;
stop)
  [ -s "$state" ] || exit 0
  # Sum each assistant message once; transcripts can repeat a message per content block.
  agent=$(printf '%s' "$input" | json '
    const seen=new Map(), inRate=+(process.env.CROPS_INPUT_USD_PER_MTOK||0), outRate=+(process.env.CROPS_OUTPUT_USD_PER_MTOK||0);
    for (const line of require("fs").readFileSync(i.transcript_path,"utf8").split("\n")) {
      try { const m=JSON.parse(line); if (m.type==="assistant"&&m.message?.usage) seen.set(m.message.id??seen.size,m.message.usage); } catch {}
    }
    let inTok=0, outTok=0;
    for (const u of seen.values()) { inTok+=(u.input_tokens||0)+(u.cache_creation_input_tokens||0)+(u.cache_read_input_tokens||0); outTok+=u.output_tokens||0; }
    console.log(JSON.stringify({tokens:inTok+outTok,cost:Math.round((inTok*inRate+outTok*outRate)/1e4)/100}))')
  api /timer/stop "{\"entryId\":\"$(cat "$state")\",\"agent\":$agent}" >/dev/null ;;
esac
```

Then add the hooks to `~/.claude/settings.json`, or to a project's `.claude/settings.local.json`, which stays out of git:

```json
{
  "env": {
    "CROPS_URL": "https://crops.wims.vc",
    "CROPS_TOKEN": "your-token",
    "CROPS_TEAM_ID": "team-uuid",
    "CROPS_PROJECT_ID": "project-uuid",
    "CROPS_INPUT_USD_PER_MTOK": "3",
    "CROPS_OUTPUT_USD_PER_MTOK": "15"
  },
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "~/.claude/hooks/crops.sh start" }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          { "type": "command", "command": "~/.claude/hooks/crops.sh resume" }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "~/.claude/hooks/crops.sh stop" }
        ]
      }
    ]
  }
}
```

The rates above are placeholders. Set them to your model's actual per-million-token prices and the markup you bill. Cache reads and writes are counted at the input rate, so adjust the script if your cache pricing differs. To find team and project ids, use the MCP `list_projects` tool, or read `team`, `teams`, and `projects` from:

```sh
curl -s https://crops.wims.vc/api/state -H "Authorization: Bearer $CROPS_TOKEN"
```

Use `GET /api/state?teamId=<id>` to list another team's projects. Hooks never change invoiced or paid time: Crops returns 409, and the hook fails without changing anything.
