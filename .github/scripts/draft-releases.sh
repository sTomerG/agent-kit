#!/usr/bin/env bash
# Drafts a GitHub release for every plugin whose version has none yet, draft or
# published. The draft carries the parts every release shares; what changed is
# left to write by hand before publishing. With DRY_RUN=1 it prints the drafts
# instead of creating them.
set -euo pipefail

repo="${GITHUB_REPOSITORY:?}"
target="${GITHUB_SHA:?}"
marketplace=$(jq -r .name .claude-plugin/marketplace.json)
# Drafts have no tag until they are published, so the releases are asked, not the tags.
released=$(gh api "repos/$repo/releases" --paginate --jq '.[].tag_name')

for manifest in plugins/*/.claude-plugin/plugin.json; do
  name=$(jq -r .name "$manifest")
  version=$(jq -r .version "$manifest")
  tag="$name-v$version"

  if grep -qxF "$tag" <<<"$released"; then
    continue
  fi

  previous=$(git tag --list "$name-v*" --sort=-v:refname | head -n 1)
  requires=$(grep -o -m 1 '^Requires Claude Code v[0-9.]* or later' "plugins/$name/README.md" || true)
  requires=${requires:+$requires.}

  if [[ -n "$previous" ]]; then
    changes="**Full changes:** https://github.com/$repo/compare/$previous...$tag"
  else
    changes="**Full changes:** https://github.com/$repo/commits/$tag/plugins/$name"
  fi

  notes=$(cat <<NOTES
<!-- One line: what this release brings, for someone who has it installed. -->

## Update

\`\`\`bash
claude plugin marketplace update $marketplace
claude plugin update $name@$marketplace
\`\`\`

Then run \`/reload-plugins\` in an open session, or restart Claude Code. With auto-update enabled for the marketplace (\`/plugin\` → Marketplaces) this happens on its own.

New here? Install with:

\`\`\`bash
claude plugin marketplace add $repo
claude plugin install $name@$marketplace
\`\`\`

${requires:-<!-- Requires Claude Code vX or later. -->}

## What's new

<!-- Each new thing as a bold lead and a sentence, for users, not reviewers. Remove the section if there is none. -->

## Fixes

<!-- Each fix as what was wrong and how it is now. Remove the section if there is none. -->

See the [README](https://github.com/$repo/blob/$tag/plugins/$name/README.md) for everything $name does.

$changes

This is an unofficial community project, not affiliated with or endorsed by Anthropic.
NOTES
)

  if [[ "${DRY_RUN:-}" == 1 ]]; then
    printf '=== would draft %s at %s\n%s\n' "$tag" "$target" "$notes"
  else
    gh release create "$tag" --repo "$repo" --draft --target "$target" --title "$name $version" --notes "$notes"
  fi
done
