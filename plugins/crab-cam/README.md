# crab-cam

A Claude Code mod: a small crab above the prompt acts out what Claude is doing, in the terminal, the desktop app and VS Code. Beside it, a shell shows how full the context window is and how much of your rate limits is used. When Claude puts helpers to work, the Crab crew pane gives each one a crab of its own.

> Optimised for the Claude Code desktop app.

![The crab-cam band cycling through thinking, reading, searching, writing code, running tests, git and done](assets/demo-scenes.svg)

## Install

```bash
claude plugin marketplace add sTomerG/agent-kit
claude plugin install crab-cam@agent-kit
```

Requires Claude Code v2.1.287 or later; tested with v2.1.288.

To get new versions, run `claude plugin update crab-cam@agent-kit`, or enable auto-update for the marketplace under `/plugin` → Marketplaces.

## Commands

| Command | What it does |
| :- | :- |
| `/crab-cam` | Hide or show the crab |
| `/crab-cam demo` | Play every scene, three seconds each, with a sample crew in the Crab crew pane |
| `/crab-cam meter` | Hide or show the shell meter |
| `/crab-cam details` | Show or hide the meter's readings in figures beside the shell |
| `/crab-cam commands` | Show commands as typed, or go back to the description of what they do |
| `/crab-cam crew` | Open or close the Crab crew pane |
| `/crab-cam crew auto` | Turn off or on that the Crab crew pane opens by itself |

## Scenes

The scene follows the tool Claude calls. A shell command is read for what it does, so `cat` shows reading and `cd repo && git status` shows git.

| Scene | Shown when |
| :- | :- |
| thinking, writing a reply | Claude reasons or writes text |
| reading | `Read`, or `cat`, `head`, `tail`, `sed -n`, `jq` in a shell |
| writing code | `Edit`, `Write`, or `sed -i`, `cat > file` in a shell |
| searching | `Grep`, `Glob`, or `grep`, `rg`, `find`, `ls` in a shell |
| browsing the web | `WebFetch`, `WebSearch`, browser tools, `curl`, `wget` |
| running a command | any other shell command |
| running tests | `pytest`, `vitest`, `jest`, `npm test`, `cargo test` and the like |
| working with git | `git` and `gh`, also further on in a chain such as `make build && git status` |
| installing packages | `npm install`, `pip install`, `uv add`, `brew install` and the like |
| putting the crew to work | subagents and workflows, during the turn and while they run on after it; the line under it says how many are at work and what they are doing, such as `crew of 3: 2 reading, 1 running tests` |
| making a plan | plan mode and task lists |
| loading a skill | `Skill` |
| writing text | an edit to a text file: `.md`, `.txt`, `.rst`, `README`, `CHANGELOG` and the like |
| designing | an edit to a stylesheet or an `.svg`, a design or Figma tool, a design or diagramming skill, the start of an artifact, and an edit to an `.html` page later in that same turn |
| remembering something | an edit to `CLAUDE.md`, `MEMORY.md` or a memory file |
| sharing something | artifacts and files sent to you |
| a question for you, waiting for permission | Claude asks, or a permission dialog is open |
| waiting on a background task | Claude polls a background command or timer, or the turn ended with a command still running |
| using a tool | any other tool |
| tidying up its memory | the conversation is compacted |
| oops | a tool call failed, or an API error or refusal ended the turn |
| done, resting | the turn ended |

The crab stays on "putting the crew to work" until the helpers return. What each of them is doing shows in the [Crab crew pane](#crab-crew-pane).

## Meter

The shell fills as things are used:

- **Ribs**: the context window.
- **Five pearls**: the 5-hour rate limit.
- **Seven smaller pearls**: the weekly rate limit.

The last two units of a gauge turn red above 85%. The pearls are left out on accounts without rate-limit windows.

The meter comes in two forms, and `/crab-cam meter` hides it altogether:

| Default | With details (`/crab-cam details`) |
| :- | :- |
| ![The meter filling up: the shell with the context window, the pearls with the rate limits](assets/demo-meter.svg) | ![The same meter with its readings in figures beside it](assets/demo-meter-details.svg) |

## Crab crew pane

![The Crab crew pane: two subagents and a workflow's three agents, each with a crab in its own colour acting out its work](assets/demo-pane.svg)

The pane opens by itself when a new round of helpers starts: the first helper after all the earlier ones are through. That clears the cards of the round before. In the terminal it opens by itself only at 144 columns or wider; `/crab-cam crew` opens it at any width.

- **Groups**: subagents under one heading, a workflow's agents under another, named after the workflows running. Each heading says how many are still running and folds when you click it.
- **Crab**: each helper has its own colour, starting with Claude's orange, and acts out its own scene. Past seven helpers in one round, the colours repeat. The terminal draws the crab in block glyphs, as the band does.
- **Title**: the task a subagent was given. A workflow's agents are given no task, so they go by their type and a number, such as `Explore 2`.
- **Details**: the agent's type, how long it has been at work, what it is doing now, and chips with its model and tokens once there is a reading.
- **Steps**: click the step count to unfold its last 50 steps, in the band's wording.
- **When it ends**: the crab shows done or oops, and the card stays until the next round.

The pane takes its ideas from helper-desk, a mod by Ben AI. No code of it is used.

## Development

```bash
claude --plugin-dir ./plugins/crab-cam   # load from disk, reload on save
claude plugin test plugins/crab-cam      # run the tests
claude plugin validate plugins/crab-cam  # check the manifest and hooks
npx tsx plugins/crab-cam/scripts/make-demo.mts  # redraw the drawings in assets/
```

The editor types under `.claude-plugin/types/` are generated and not committed. Claude Code writes them for your version when it loads the mod with `--plugin-dir`.

---

An unofficial community project, not affiliated with or endorsed by Anthropic.
