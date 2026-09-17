# Crops for agents and integrations

**In plain English:** the **API** is the web interface that programs call to read and change Crops data; the web, Mac, and Android apps all use it. The **MCP server** is a small adapter that exposes that API as tools an AI agent (such as Claude Code) can call on its own. **Webhooks** are single URLs that tools like Zapier or iOS Shortcuts can POST to. All of them authenticate with an **access key** you create in Settings.

Crops can also bill clients for agent work. A time entry may carry **agent usage**: `{tokens, cost, model}` that the agent computes and reports itself. Crops does not meter tokens or call any model API. Billable entries are valued at hours × project rate **plus** the reported USD cost in Reports, Billing, and CSV export. See [API.md](API.md#agent-usage) for the field rules.

There are three ways to connect:

- **MCP server** (`mcp/crops-mcp.mjs`): lets an agent list projects, run timers, log time, review, edit, and delete entries, and report usage as tools.
- **Webhooks** (`POST /api/hooks/<key>`): let any tool that can send an HTTP POST start, stop, log, or edit time.
- **Hooks**: have your agent host start and stop a timer automatically with `curl`, with no model involvement.

## Create an access key

In Crops, open **Settings → Access keys**, name the key after where it will live (for example "Claude Code" or "Stream Deck"), and choose **Create key**. Crops shows the key once, with ready-to-copy webhook URL, `curl`, and `claude mcp add` commands. Copy it then; Crops stores only a hash.

A key acts as you, with your current team permissions, until you revoke it in Settings. It cannot create or revoke keys or change passwords. Use one key per tool so you can revoke one without breaking the others.

## MCP server

The server uses stdio JSON-RPC 2.0 with no dependencies beyond Node 22. Configure it with environment variables:

| Variable                            | Purpose                                                       |
| ----------------------------------- | ------------------------------------------------------------- |
| `CROPS_URL`                         | Crops origin. Defaults to `https://crops.wims.vc`.            |
| `CROPS_ACCESS_KEY`                  | Access key from Settings (recommended).                       |
| `CROPS_TOKEN`                       | A 30-day session token, used when no access key is set.       |
| `CROPS_USERNAME` / `CROPS_PASSWORD` | Signs in via `/api/auth/login` when no key or token is given. |

### Claude Code

```sh
claude mcp add crops \
  -e CROPS_URL=https://crops.wims.vc \
  -e CROPS_ACCESS_KEY=crops_your-key \
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
        "CROPS_ACCESS_KEY": "crops_your-key"
      }
    }
  }
}
```

From a checkout, `npm run mcp` starts the same server.

### Tools

| Tool                 | Arguments                                                                                                                   | Does                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `list_projects`      | `includeArchived?`                                                                                                          | Teams with their clients and projects, including ids, billable flags, and rates.                                             |
| `current_timer`      | none                                                                                                                        | The running timer, with project, client, and elapsed seconds.                                                                |
| `start_timer`        | `projectId`, `task?`, `notes?`, `billable?`, `agent?`                                                                       | Starts a new timer (stopping any other) dated today in local time.                                                           |
| `stop_timer`         | `agent?: {tokens, cost, model?}`                                                                                            | Stops the running timer and optionally attaches usage.                                                                       |
| `resume_timer`       | `entryId`                                                                                                                   | Restarts the timer on one of your existing unbilled entries.                                                                 |
| `log_time`           | `projectId`, `durationMinutes` or `durationSeconds`, `date?`, `task?`, `notes?`, `billable?`, `agent?`                      | Adds a completed entry.                                                                                                      |
| `list_entries`       | `from?`, `to?` (YYYY-MM-DD, default the last 7 days), `projectId?`, `teamId?`, `mine?` (default true)                       | Entries with id, version, date, project and client names, task, notes, duration, billable, status, running, and agent usage. |
| `update_entry`       | `entryId`, `task?`, `notes?`, `date?`, `durationMinutes?` or `durationSeconds?`, `projectId?`, `billable?`, `agent?`/`null` | Edits only the fields given. Fetches the current version and retries once on a version conflict.                             |
| `delete_entry`       | `entryId`                                                                                                                   | Deletes a stopped, unbilled entry, using its current version.                                                                |
| `report_agent_usage` | `entryId`, `tokens`, `cost`, `model?`, `mode?: "add" \| "set"`                                                              | Adds usage to an entry's recorded usage (default), or replaces it. Uses the entry's version and retries a version conflict.  |

`cost` is USD. The server rounds it to cents before sending. Every POST sends an `Idempotency-Key`, and a network retry reuses that key so it cannot record time twice. Edits and deletes are never retried after a network failure. Tool failures, such as a locked invoiced entry, come back as `isError` results with the Crops error message.

## Webhooks

Anything that can send an HTTP POST can track time. The webhook URL is shown when you create a key: `https://crops.wims.vc/api/hooks/crops_your-key`. **The URL contains your key, so keep it private.** Send a JSON body with an `action`:

| `action` | Fields                                                                                       |
| -------- | -------------------------------------------------------------------------------------------- |
| `start`  | `projectId`, `task?`, `notes?`, `billable?`, `date?`, `agent?`; or `entryId` to resume       |
| `stop`   | `entryId?` (defaults to your running timer), `agent?`                                        |
| `toggle` | Same as `start`; stops your running timer if there is one, otherwise starts                  |
| `log`    | `projectId`, `durationMinutes` or `durationSeconds`, `date?`, `task?`, `notes?`, `billable?` |
| `update` | `entryId`, fields to change; `version?` (defaults to the current version)                    |
| `delete` | `entryId`, `version?`                                                                        |

Responses match the REST API (`{entry}` or `{ok:true}`). Find project ids in the MCP `list_projects` tool, or in `projects` from `GET /api/state`. Full rules are in [API.md](API.md#webhooks).

```sh
curl -X POST https://crops.wims.vc/api/hooks/crops_your-key \
  -H 'Content-Type: application/json' \
  -d '{"action":"toggle","projectId":"project-uuid","task":"Focus","timezone":"America/Chicago"}'
```

- **Zapier / Make / n8n:** add a "Webhooks: POST" step with the URL above, payload type JSON, and data such as `action=log`, `projectId=…`, `durationMinutes=30`, `task={{trigger title}}`.
- **iOS Shortcuts:** use "Get Contents of URL" with method POST, Request Body JSON, and fields `action` = `toggle`, `projectId` = your project id, and `timezone` = your IANA timezone (for example `America/Chicago`) so entries use your local date. Put it on your Home Screen or run it from an NFC tag.
- **Stream Deck:** use a web request / HTTP POST action with the URL above and the body `{"action":"toggle","projectId":"project-uuid","timezone":"America/Chicago"}`.
- **CI:** store the key as a secret and send `Authorization: Bearer $CROPS_ACCESS_KEY` to `POST /api/hooks` to keep it out of URLs and logs.

## Claude Code hooks

Hooks track a session without the model doing anything. This script starts a timer when a session starts, resumes that entry when you send a prompt, and stops it when Claude finishes responding. On stop, it reports the session's cumulative tokens from the transcript and a cost estimate from rates you set. Because the usage is cumulative, each stop replaces the entry's usage. It calls the webhook endpoint with `curl` and uses `node` to read JSON.

Save this as `~/.claude/hooks/crops.sh` and run `chmod +x` on it:

```sh
#!/bin/sh
# Usage: crops.sh start|resume|stop. Claude Code passes hook JSON on stdin.
set -eu
: "${CROPS_URL:=https://crops.wims.vc}" "${CROPS_ACCESS_KEY:?}" "${CROPS_PROJECT_ID:?}"
export CROPS_PROJECT_ID
input=$(cat)
json() { node -e "const i=JSON.parse(require('fs').readFileSync(0,'utf8'));$1"; }
session=$(printf '%s' "$input" | json 'console.log(i.session_id)')
state="${TMPDIR:-/tmp}/crops-$session.entry"
hook() { curl -sf -X POST "$CROPS_URL/api/hooks" -H "Authorization: Bearer $CROPS_ACCESS_KEY" \
  -H 'Content-Type: application/json' -H "Idempotency-Key: $(uuidgen)" -d "$1"; }
case "$1" in
start)
  body=$(node -e 'const d=new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,10);
    console.log(JSON.stringify({action:"start",projectId:process.env.CROPS_PROJECT_ID,date:d,task:"Agent",notes:"Claude Code session"}))')
  hook "$body" | json 'console.log(i.entry.id)' >"$state" ;;
resume)
  [ -s "$state" ] || exit 0
  hook "{\"action\":\"start\",\"entryId\":\"$(cat "$state")\"}" >/dev/null ;;
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
  hook "{\"action\":\"stop\",\"entryId\":\"$(cat "$state")\",\"agent\":$agent}" >/dev/null ;;
esac
```

Then add the hooks to `~/.claude/settings.json`, or to a project's `.claude/settings.local.json`, which stays out of git:

```json
{
  "env": {
    "CROPS_URL": "https://crops.wims.vc",
    "CROPS_ACCESS_KEY": "crops_your-key",
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

The rates above are placeholders. Set them to your model's actual per-million-token prices and the markup you bill. Cache reads and writes are counted at the input rate, so adjust the script if your cache pricing differs. To find project ids, use the MCP `list_projects` tool, or read `teams` and `projects` from:

```sh
curl -s https://crops.wims.vc/api/state -H "Authorization: Bearer $CROPS_ACCESS_KEY"
```

Use `GET /api/state?teamId=<id>` to list another team's projects. Hooks never change invoiced or paid time: Crops returns 409, and the hook fails without changing anything.
