import { expect, test } from 'claude-code/testing'

import type { Activity } from '../types'
import { activityOf, activityOfStreaming, helpersLine, isHandback, opensDesign, sceneOfLingering } from './activity'

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
  ['set -e; git add -A && git commit -m "Fix"', 'git'],
  ['ls plugins && git status --short', 'git'],
  ['make build; git diff --stat', 'git'],
  ['python3 build.py\ngit log --oneline -3', 'git'],
  ['for f in a b; do git add "$f"; done', 'git'],
  ['echo "then run git status; git push"', 'terminal'],
  ['grep -rn "git commit" docs', 'searching'],
  ["python3 - <<'EOF'\nprint(1)\ngit status\nEOF", 'terminal'],
  ['cat .gitignore', 'reading'],
  ["sed -i '' 's/a/b/' file.ts", 'coding'],
  ["cat > file.ts <<'EOF'\nconst a = 1\nEOF", 'coding'],
  ['echo hello >> notes.md', 'writing'],
  ["sed -i '' 's/red/blue/' theme.css", 'designing'],
  ["cat > docs/README <<'EOF'\n# Title\nEOF", 'writing'],
  ["sed -i '' 's/a/b/' CHANGELOG.md", 'writing'],
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
  expect(activityOf('Edit', { file_path: '/repo/README.md' })).toBe('writing')
  expect(activityOf('Edit', { file_path: 'src/app.css' })).toBe('designing')
  expect(activityOf('Write', { file_path: 'assets/logo.svg' })).toBe('designing')
  expect(activityOf('Write', { file_path: 'scratchpad/tide-table.html' })).toBe('coding')
  expect(activityOf('Artifact', { action: 'quickstart', intent: 'other' })).toBe('designing')
  expect(activityOf('Artifact', { file_path: 'scratchpad/tide-table.html' })).toBe('sharing')
  expect(activityOf('Edit', { file_path: 'src/App.tsx' })).toBe('coding')
  expect(activityOf('Skill', { skill: 'artifact-design' })).toBe('designing')
  expect(activityOf('Skill', { skill: 'code-review' })).toBe('skill')
  expect(activityOf('DesignSync')).toBe('designing')
  expect(activityOf('mcp__figma__get_file')).toBe('designing')
  expect(activityOf('Write', { file_path: 'notes.txt' })).toBe('writing')
  expect(activityOf('Write', { file_path: 'LICENSE' })).toBe('writing')
  expect(activityOf('Write', { file_path: 'config.json' })).toBe('coding')
  expect(activityOf('Grep', { pattern: 'x' })).toBe('searching')
  expect(activityOf('mcp__Claude_Browser__navigate')).toBe('web')
  expect(activityOf('mcp__server__thing')).toBe('tool')
})

test('a tool the table does not know goes by the verb in its name', () => {
  expect(activityOf('mcp__atlassian__searchJiraIssuesUsingJql')).toBe('searching')
  expect(activityOf('mcp__atlassian__getJiraIssue')).toBe('reading')
  expect(activityOf('mcp__docs__read')).toBe('reading')
  expect(activityOf('mcp__visualize__show_widget')).toBe('sharing')
  expect(activityOf('mcp__atlassian__createJiraIssue')).toBe('tool')
  expect(activityOf('mcp__terminal__read_terminal')).toBe('terminal')
})

test('built-in tools beyond the common ones have a scene of their own', () => {
  expect(activityOf('ReportFindings')).toBe('sharing')
  expect(activityOf('TaskStop')).toBe('terminal')
  expect(activityOf('TaskList')).toBe('planning')
  expect(activityOf('EnterWorktree')).toBe('git')
  expect(activityOf('SearchSkills')).toBe('searching')
  expect(activityOf('ReadNotifications')).toBe('reading')
})

test('background work left by a turn keeps the crab from resting', () => {
  expect(sceneOfLingering([])).toBe(undefined)
  expect(sceneOfLingering([{ type: 'shell', description: 'Run the test suite', command: 'npm test' }])).toEqual({
    activity: 'waiting',
    detail: 'npm test',
  })
  expect(
    sceneOfLingering([
      { type: 'subagent', description: 'Review the diff' },
      { type: 'workflow', description: 'Audit the release' },
    ]),
  ).toEqual({ activity: 'delegating', detail: '2 tasks in the background' })
  expect(
    sceneOfLingering([
      { type: 'subagent', description: 'Review the diff' },
      { type: 'shell', description: 'Build', command: 'make build' },
    ]),
  ).toEqual({ activity: 'waiting', detail: '2 tasks in the background' })
})

test('an artifact that is only being watched lets the crab rest', () => {
  const watch = { type: 'monitor', description: 'live updates for artifact https://claude.ai/artifact/abc' }

  expect(sceneOfLingering([watch])).toBe(undefined)
  expect(sceneOfLingering([watch, { type: 'shell', description: 'Build', command: 'make build' }])).toEqual({
    activity: 'waiting',
    detail: 'make build',
  })
})

test('a command still being written shows its scene once its first word is in', () => {
  expect(activityOfStreaming('Bash', '')).toBe(undefined)
  expect(activityOfStreaming('Bash', '{"description": "Read the notes", "comm')).toBe(undefined)
  expect(activityOfStreaming('Bash', '{"command": "ca')).toBe(undefined)
  expect(activityOfStreaming('Bash', '{"command": "cat notes.md')).toBe('reading')
  expect(activityOfStreaming('Bash', '{"command": "cd /repo')).toBe(undefined)
  expect(activityOfStreaming('Bash', '{"command": "cd /repo && git st')).toBe('git')
  expect(activityOfStreaming('Bash', '{"command":"python3 - <<\'EOF\'\\nimport json')).toBe('terminal')
  expect(activityOfStreaming('Bash', '{"command": "make bu')).toBe(undefined)
  expect(activityOfStreaming('Bash', '{"command": "cat > hooks/activity.ts <<\'EOF\'\\nconst')).toBe('coding')
  expect(activityOfStreaming('Bash', '{"command": "cat > notes')).toBe(undefined)
  expect(activityOfStreaming('Bash', '{"command": "cat > notes.md <<\'EOF\'\\n# Notes')).toBe('writing')
})

test('a file on its way shows the scene of the file as soon as its path is in', () => {
  expect(activityOfStreaming('Write', '')).toBe(undefined)
  expect(activityOfStreaming('Write', '{"file_path": "scratchpad/tide-table.ht')).toBe(undefined)
  expect(activityOfStreaming('Write', '{"file_path": "scratchpad/tide-table.html", "content": "<ti')).toBe('coding')
  expect(activityOfStreaming('Write', '{"file_path": "src/theme.css", "content": ":ro')).toBe('designing')
  expect(activityOfStreaming('Edit', '{"file_path": "hooks/activity.ts"')).toBe('coding')
  expect(activityOfStreaming('Write', '{"file_path": "notes.md"')).toBe('writing')
  expect(activityOfStreaming('Skill', '{"skill": "artifact-design"')).toBe('designing')
  expect(activityOfStreaming('Artifact', '{"action": "quickstart"')).toBe('designing')
})

test('a page is designed once the turn has taken up design work', () => {
  expect(activityOf('Write', { file_path: 'scratchpad/tide-table.html' }, true)).toBe('designing')
  expect(activityOf('Edit', { file_path: 'site/index.htm' }, true)).toBe('designing')
  expect(activityOf('Edit', { file_path: 'src/App.tsx' }, true)).toBe('coding')
  expect(activityOf('Write', { file_path: 'notes.md' }, true)).toBe('writing')
  expect(activityOf('Bash', { command: "cat > page.html <<'EOF'" }, true)).toBe('designing')
  expect(activityOf('Bash', { command: "cat > page.html <<'EOF'" })).toBe('coding')
  expect(activityOfStreaming('Write', '{"file_path": "scratchpad/tide-table.html", "content": "<ti', true)).toBe('designing')
})

test('a design skill, a design tool or the start of an artifact takes up design work', () => {
  expect(opensDesign('Skill', { skill: 'artifact-design' })).toBe(true)
  expect(opensDesign('Skill', { skill: 'artifact-diagramming' })).toBe(true)
  expect(opensDesign('Artifact', { action: 'quickstart', intent: 'other' })).toBe(true)
  expect(opensDesign('mcp__figma__get_file')).toBe(true)
  expect(opensDesign('Skill', { skill: 'code-review' })).toBe(false)
  expect(opensDesign('Edit', { file_path: 'src/app.css' })).toBe(false)
  expect(opensDesign('Bash', { command: "sed -i '' 's/red/blue/' theme.css" })).toBe(false)
  expect(opensDesign('Artifact', { file_path: 'scratchpad/tide-table.html' })).toBe(false)
})

test('helpers at work are counted by what they are doing, the most common first', () => {
  expect(helpersLine([])).toBe('')
  expect(helpersLine([{ activity: 'reading' }])).toBe('1 helper: reading')
  expect(helpersLine([{ activity: 'testing', about: 'Review the diff' }])).toBe('Review the diff: running tests')
  expect(helpersLine([{ activity: 'thinking' }, { activity: 'terminal' }, { activity: 'terminal', about: 'Build' }])).toBe(
    '3 helpers: 2 running commands, 1 thinking',
  )
})

test('the call a helper hands its answer back with is no work of its own', () => {
  expect(isHandback('SubagentHandback')).toBe(true)
  expect(isHandback('StructuredOutput')).toBe(true)
  expect(isHandback('Read')).toBe(false)
})
