# claude-code-3d — Spec

A 3D "office" that shows what Claude Code is doing in real time. Characters (SA / Dev / Tester / Summary) react to Claude Code events. Runs in a browser first; later wrapped as a Claude Code plugin and a VS Code extension.

Status: v0.2 — M1 to M4 are built and were checked on Windows against Claude Code 2.1.269 (real sessions with the plugin loaded via `--plugin-dir`). M5 (VS Code extension) is not started. The text below is the original plan; section 12 records what changed.

## 1. Goals

- Watch a Claude Code session as a 3D scene: who is "working", on what, how long, how many tokens.
- Zero config for users: install, open, it works.
- Local only: no data leaves the machine.
- Monitor only (read-only). No approving or controlling Claude Code from the UI in v1.

## 2. Non-goals (v1)

- No control or input back into Claude Code.
- No cloud, account or login.
- No dependency on any other project (this repo is standalone).
- No realtime per-character token streaming (tokens arrive per response, from the transcript).

## 3. Architecture

```
Claude Code ──hooks──▶ send-event script ──HTTP POST──▶ Core server (Node, 127.0.0.1)
     └── transcript .jsonl (tailed by the server) ──────▶        │
                                                          WebSocket / SSE
                                                                 ▼
                                                      Web UI (three.js scene)
```

- **core**: Node server + static web UI. Knows nothing about VS Code or plugins; accepts generic event JSON.
- **hook script**: tiny, silent, fast. Always `exit 0`, short timeout, never slows or breaks Claude Code when the server is not running.
- **web UI**: three.js scene, renders from state only, can run standalone in a browser.
- **wrappers** (later): Claude Code plugin (bundles hooks + `/office` command), VS Code extension (webview around the same UI).

## 4. Events

Hook → event mapping (to be confirmed against the docs):

| Hook | Meaning in the scene |
|---|---|
| `UserPromptSubmit` | New task starts; SA begins reading the question |
| `PreToolUse` | A tool starts; the matching character becomes "working" |
| `PostToolUse` | Tool finished; character returns to idle or moves on |
| `SubagentStop` | A subagent finished; its character shows a done tick |
| `Stop` | Turn finished; Summary writes the answer, then done |

Role mapping (our own rule, Claude Code has no real roles; make it configurable):

- SA: Read, Grep, Glob, WebSearch, WebFetch
- Dev: Edit, Write, NotebookEdit
- Tester: Bash running test/build commands
- Summary: final answer at `Stop`

Every event carries `session_id`. Multiple sessions = multiple offices (or tabs); never mix them.

## 5. Scene and HUD

- Round office, one desk per role, centre table, per-role colour (SA blue, Dev teal, Tester orange, Summary pink).
- Name tag per role: state text (Waiting / Working · tool name / Done) and a done tick.
- Top bar: pipeline `SA → Dev → Tester → Summary` with state per step.
- Bottom HUD: elapsed timer, token count (in/out), progress bar.
- Reset button to clear the current session view.

## 6. Tokens and time

- Timer: from `UserPromptSubmit` to `Stop`.
- Tokens: read `usage` from the session transcript `.jsonl` under `~/.claude/projects/...`; sum per response. Update when a response completes, not per character.

## 7. Distribution (in this order)

1. **Standalone core**: `npx claude-code-3d` starts the server and opens the page. Needs an npm account.
2. **Claude Code plugin**: GitHub repo with plugin manifest + `hooks` + `/office` command. Install via `/plugin marketplace add <user>/<repo>`. Needs only a GitHub account.
3. **VS Code extension**: webview wrapper, commands `Claude Code 3D: Open` and `Install Hooks`. Local `.vsix` first; Marketplace later (own publisher, not shared with other projects).

## 8. Safety and privacy

- Bind to `127.0.0.1` only; pick a free port automatically.
- Hooks reveal file paths and commands: state clearly in the README that all data stays local.
- Never overwrite the user's `settings.json`; merge, back up, and ask before writing hooks (extension path). The plugin path avoids editing it at all.
- Hook script must fail silently.

## 9. Proposed layout

```
claude-code-3d/
├─ spec.md
├─ packages/core/     # server + web UI (npm package)
├─ plugin/            # Claude Code plugin: hooks + /office
└─ vscode/            # webview wrapper (later)
```

## 10. Milestones

- **M1**: server + web page; a fake event simulator drives the scene (`npm run demo`). No Claude Code needed.
- **M2**: real hooks → server → scene, single session.
- **M3**: transcript tailing for tokens and time; multi-session by `session_id`.
- **M4**: Claude Code plugin packaging + README with screenshots/GIF.
- **M5**: VS Code extension wrapper.

## 11. Open questions

- Project name availability on GitHub (`claude-code-3d`): still open, check before publishing. npm is no longer needed.
- ~~Exact hook payload fields and plugin manifest format~~ Resolved: see section 12.
- ~~Parallel subagents~~ Resolved: folded into the four roles by keywords in the agent type or description; unknown goes to Dev.
- ~~Art style~~ Resolved: low-poly primitives with three switchable themes (samurai, office, Isan farmer).
- ~~Licence~~ Resolved: MIT.
- Open: VS Code extension (M5), and whether hooks behave the same in the VS Code extension (docs imply it, not tested).

## 12. What changed from the plan

- **Plugin layout**: the repo root is both the marketplace and the plugin (`source: "."`), with `hooks/hooks.json`, `commands/office.md` and `scripts/` at the root and the engine in `packages/core/`. There is no separate `plugin/` folder. The command is `/claude-code-3d:office`; Claude Code always prefixes the plugin name.
- **No npm and no `npm install`**: distribution is the GitHub marketplace only (step 1 of section 7 is dropped). The few three.js files the scene needs are committed under `packages/core/public/vendor/`.
- **Hooks**: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `SubagentStop` and `Stop`, all `async`, run through `node` in exec form. The hook script redacts the payload before sending it.
- **Background server**: started on demand by the hook or open script, shared by all sessions, found through `~/.claude-code-3d/server.json`, port 3737 preferred with a free-port fallback, exits after an hour idle.
- **Tokens**: the transcript format is not documented (Claude Code calls it internal), so parsing is defensive. One message can span several transcript lines with the same usage, so usage is counted once per `message.id`. Shown per task, with the cache breakdown in a tooltip.
- **Sessions**: kept separate by `session_id`; the page has a Session picker when more than one exists.
- **Added**: a team lead who walks to each worker, three themes with a theme picker, Host and Origin checks on the local server.
