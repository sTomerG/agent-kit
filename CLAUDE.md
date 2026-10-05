# agent-kit

Public Claude Code plugin marketplace. Each plugin lives in `plugins/<name>/` and is listed in `.claude-plugin/marketplace.json`.

- Everything in this repo is written in English: code, comments, documentation, commit messages, pull requests and issues.
- Keep a plugin's `name` in `plugin.json` identical to its entry name in `marketplace.json`.
- Each plugin sets `version` in its `plugin.json` only, never in the marketplace entry. Installs stay on a version until it changes, so bump it in every commit that should reach users.
- Run `claude plugin validate .` after every change to a manifest, and `claude plugin validate plugins/<name>` after every change to a plugin. The first checks the marketplace only; the second checks the plugin's hooks and state contract, and a plugin that fails it does not load.
- Run `claude plugin test plugins/<name>` for a plugin with tests. Passing tests do not show that the plugin validates.
- Declare every `$.state` value a plugin uses in its `types/index.d.ts`, in the same commit that adds it.
