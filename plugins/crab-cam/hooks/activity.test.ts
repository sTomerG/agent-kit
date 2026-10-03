import { expect, test } from 'claude-code/testing'

import type { Activity } from '../types'
import { activityOf } from './activity'

const COMMANDS: readonly (readonly [string, Activity])[] = [
  ['cat README.md', 'reading'],
  ['head -40 hooks/register.tsx', 'reading'],
  ["sed -n '1,20p' file.ts", 'reading'],
  ['cat notes.md | grep TODO', 'reading'],
  ['grep -rn "crab" src', 'searching'],
  ['find . -name "*.ts"', 'searching'],
  ['ls -la', 'searching'],
  ['/usr/bin/grep foo bar', 'searching'],
  ['curl -s https://example.com', 'web'],
  ['git status', 'git'],
  ['cd repo && git status', 'git'],
  ['cd "my repo" && gh pr list', 'git'],
  ['GIT_PAGER=cat git log', 'git'],
  ["sed -i '' 's/a/b/' file.ts", 'coding'],
  ["cat > file.ts <<'EOF'\nconst a = 1\nEOF", 'coding'],
  ['echo hello >> notes.md', 'coding'],
  ['echo hello', 'terminal'],
  ['cat file.ts 2>/dev/null', 'reading'],
  ['ls missing 2>&1', 'searching'],
  ['cd app && npm test', 'testing'],
  ['uv run pytest -q', 'testing'],
  ['npm install left-pad', 'installing'],
  ['cd app && pip install requests', 'installing'],
  ['python script.py', 'terminal'],
  ['make build', 'terminal'],
  ['for f in *.ts; do cat "$f"; done', 'terminal'],
]

for (const [command, activity] of COMMANDS) {
  test(`Bash: ${command.split('\n')[0]} is ${activity}`, () => {
    expect(activityOf('Bash', { command })).toBe(activity)
  })
}

test('Bash without its arguments yet is a command', () => {
  expect(activityOf('Bash')).toBe('terminal')
})

test('a tool is known by its name', () => {
  expect(activityOf('Read', { file_path: 'a.ts' })).toBe('reading')
  expect(activityOf('Edit', { file_path: 'a.ts' })).toBe('coding')
  expect(activityOf('Edit', { file_path: '/repo/CLAUDE.md' })).toBe('memory')
  expect(activityOf('Grep', { pattern: 'x' })).toBe('searching')
  expect(activityOf('mcp__Claude_Browser__navigate')).toBe('web')
  expect(activityOf('mcp__server__thing')).toBe('tool')
})
