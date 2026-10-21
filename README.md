# Claude Code 3D

Watch what Claude Code is doing as a live 3D scene. A team lead walks around handing out work to a scout, a developer, a tester and a summariser, while a timer and token counter run along the bottom.

Local only. Read only. Nothing leaves your machine.

Created by kob ai.

Three looks ship with it (pick one from the **Theme** box): a samurai hall, a plain office, and an old Isan (north-eastern Thai) field hut.

[ภาษาไทย](README.th.md)

## What you need

- Claude Code with plugin support (the CLI; the VS Code extension shares plugins and settings with the CLI but has not been tested)
- Node.js 18 or newer on your `PATH`
- A browser with WebGL

## Install

In a Claude Code session:

```
/plugin marketplace add thekaroe-thailand/claude-code-3d
/plugin install claude-code-3d@claude-code-3d
```

Then reload plugins (`/reload-plugins`) or start a new session.

## Use

Open the scene with:

```
/claude-code-3d:office
```

Options: `--theme=samurai`, `--theme=office`, `--theme=isan`, `--no-open` (print the address only).

Or open `http://127.0.0.1:3737/` yourself. If that port is busy the server picks a free one; the address is in `~/.claude-code-3d/server.json`.

The background server starts by itself the first time a hook fires, is shared by every Claude Code session on the machine, and stops after an hour with no activity and no open page.

## What you see

| Who | Does what |
|---|---|
| **SA** (scout) | `Read`, `Grep`, `Glob`, web search and fetch, MCP tools, and subagents that explore or plan |
| **Dev** (developer) | `Edit`, `Write`, other shell commands, and general subagents |
| **Tester** | shell commands that look like test, build, lint or type-check runs, and review subagents |
| **Summary** | writes the final answer when the turn ends |

- A new prompt starts a new task: the timer restarts and the scout "reads the prompt".
- The team lead walks to whoever just received work and hands over a scroll. The speech bubble shows the tool and a short detail (a file name, a command, a pattern).
- **Tokens** are counted per task from the session transcript, counting each message once. Hover the number for the cache breakdown. If the transcript cannot be read, the field shows `—`.
- Several Claude Code sessions can run at once. A **Session** box appears when there is more than one; sessions are never mixed. "Latest" follows whichever session was active last.
- Drag to turn the camera, scroll to zoom, double-click to reset it.

## Privacy

- Everything stays on `127.0.0.1`. There is no account, no analytics and no network call.
- The hook script forwards only: the event name, session id, transcript path, working folder, tool name, agent type, and a few short fields of the tool input (command, file path, pattern, URL, query). Strings are cut to 300 characters and the server keeps shorter versions: file paths show only their last two segments and commands the first 120 characters.
- **Prompts, file contents and tool output are never forwarded or stored.**
- The page shows commands and file names on screen. Do not leave it visible on a shared screen if that matters to you.
- The server only reads transcripts that live inside your Claude config folder, and only to add up token usage.
- It refuses requests from other web pages and hostnames (Origin and Host checks), so a website cannot read or feed it.
- Other user accounts on the same computer can reach `127.0.0.1`. On a shared machine, treat the scene as visible to them.

## Troubleshooting

- **Nothing moves.** Make sure `node --version` prints 18 or higher. Run a session with `C3D_DEBUG=1` set and read `~/.claude-code-3d/hook.log`.
- **`/claude-code-3d:office` is unknown.** Reload plugins or start a new session. Claude Code always puts the plugin name in front, so `/office` alone does not work.
- **"This site can't be reached".** The server is not running. Run `/claude-code-3d:office`, or any Claude Code prompt, and it starts. A saved bookmark only works while the server is up.
- **A role looks stuck on "working".** It is released after ten minutes without events, and when the turn ends. Interrupting a turn can leave it in that state until then.
- **Stop the server.** It exits on its own when idle. To stop it now, end the process id stored in `~/.claude-code-3d/server.json`.
- **Uninstall.** `/plugin uninstall claude-code-3d@claude-code-3d`, then delete `~/.claude-code-3d`.

## Good to know

- The hooks run asynchronously and always exit 0, so they cannot slow down or break a session. Each one starts a short Node process.
- Claude Code documents the hook payloads but calls the transcript format internal and subject to change. Token counting is written defensively and degrades to `—` instead of breaking.
- Subagents are mapped to the four roles by keywords in their type or description (for example "explore" and "plan" go to the scout). Unknown types go to Dev.
- Tested on Windows. macOS and Linux should work but have not been tried.

## Development

```
cd packages/core
npm test          # unit and integration tests
npm run demo      # fake session that replays forever, opens http://127.0.0.1:3737/
```

Try the plugin from a checkout without installing it:

```
claude --plugin-dir .
claude plugin validate .
```

Layout:

```
.claude-plugin/    plugin and marketplace manifests
hooks/hooks.json   hook registration (all asynchronous)
commands/office.md the /claude-code-3d:office command
scripts/           hook script, open script, shared helpers
packages/core/     server, web UI, themes, tests
  public/vendor/   three.js copies, so no npm install is needed
```

To add a theme, write a scene module in `packages/core/public/`, add one line to `public/themes.js`, and optionally a `[data-theme="..."]` block in `style.css`. `npm run vendor` refreshes the three.js copies after `npm install`.

## License

MIT. three.js is MIT as well; see `packages/core/public/vendor/three-LICENSE.txt`.
