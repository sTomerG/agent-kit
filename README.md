# agent-kit

Open-source extensions for Claude Code, packaged as a [plugin marketplace](https://code.claude.com/docs/en/plugin-marketplaces).

![crab-cam: a crab above the prompt acts out what Claude is doing](plugins/crab-cam/assets/demo-scenes.svg)

## Install

In Claude Code:

```bash
claude plugin marketplace add sTomerG/agent-kit
claude plugin install crab-cam@agent-kit
```

To receive updates automatically, open `/plugin`, select **Marketplaces** → `agent-kit` → **Enable auto-update**.

## Plugins

| Plugin | What it does |
| :- | :- |
| [`crab-cam`](plugins/crab-cam) | Mod: a crab above the prompt acts out what Claude is doing, with a meter for context and rate limits |

## License

[MIT](LICENSE). An unofficial community project, not affiliated with or endorsed by Anthropic.
