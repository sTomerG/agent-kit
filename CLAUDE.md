# agent-kit

Public Claude Code plugin marketplace. Each plugin lives in `plugins/<name>/` and is listed in `.claude-plugin/marketplace.json`.

- Everything in this repo is written in English: code, comments, documentation, commit messages, pull requests and issues.
- Keep a plugin's `name` in `plugin.json` identical to its entry name in `marketplace.json`.
- Each plugin sets `version` in its `plugin.json` only, never in the marketplace entry. Installs stay on a version until it changes, so bump it in every commit that should reach users.
- Run `claude plugin validate .` after every change to a manifest or plugin, and `claude plugin test plugins/<name>` for a plugin with tests.
