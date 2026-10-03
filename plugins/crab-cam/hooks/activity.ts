import type { Activity } from '../types'

const BY_TOOL: Record<string, Activity> = {
  Read: 'reading',
  NotebookRead: 'reading',
  ReadMcpResourceTool: 'reading',
  ListMcpResourcesTool: 'reading',
  Skill: 'skill',
  Edit: 'coding',
  MultiEdit: 'coding',
  Write: 'coding',
  NotebookEdit: 'coding',
  Bash: 'terminal',
  KillShell: 'terminal',
  BashOutput: 'waiting',
  TaskOutput: 'waiting',
  Monitor: 'waiting',
  ScheduleWakeup: 'waiting',
  CronCreate: 'waiting',
  Grep: 'searching',
  Glob: 'searching',
  LS: 'searching',
  ToolSearch: 'searching',
  WebFetch: 'web',
  WebSearch: 'web',
  Agent: 'delegating',
  Task: 'delegating',
  Workflow: 'delegating',
  SendMessage: 'delegating',
  AskUserQuestion: 'asking',
  TodoWrite: 'planning',
  TaskCreate: 'planning',
  TaskUpdate: 'planning',
  EnterPlanMode: 'planning',
  ExitPlanMode: 'planning',
  Artifact: 'sharing',
  SendUserFile: 'sharing',
  PushNotification: 'sharing',
}

const TESTS = /\b(pytest|vitest|jest|mocha|rspec|phpunit|tox|unittest|(go|cargo|bun|deno|dotnet) test|(npm|pnpm|yarn)( run)? test)\b/
const INSTALL =
  /\b((npm|pnpm|yarn|bun) (install|add|i|ci)|pip3? install|uv (add|sync|pip)|poetry (add|install)|brew install|cargo (add|install)|apt(-get)? install)\b/
const MEMORY = /\/memory\/|(^|\/)(CLAUDE|MEMORY)\.md$/

// What may stand before the command that does the work: a change of
// directory, a variable set for the one command, a wrapper.
const LEAD =
  /^\s*(?:(?:cd|pushd)\s+(?:"[^"]*"|'[^']*'|\S+)\s*(?:&&|;)\s*|[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)\s+|(?:sudo|time|command|exec|nohup)\s+)/
// Output sent to a file; a stream copied to another (`2>&1`) or thrown away is none.
const TO_FILE = /(^|[^0-9&>])>{1,2}\s*(?!\/dev\/null)[^\s&|>]/

const BY_COMMAND: Record<string, Activity> = {
  git: 'git',
  gh: 'git',
  cat: 'reading',
  head: 'reading',
  tail: 'reading',
  less: 'reading',
  more: 'reading',
  bat: 'reading',
  wc: 'reading',
  nl: 'reading',
  jq: 'reading',
  yq: 'reading',
  sed: 'reading',
  awk: 'reading',
  diff: 'reading',
  stat: 'reading',
  file: 'reading',
  grep: 'searching',
  egrep: 'searching',
  fgrep: 'searching',
  rg: 'searching',
  ag: 'searching',
  ack: 'searching',
  find: 'searching',
  fd: 'searching',
  ls: 'searching',
  tree: 'searching',
  which: 'searching',
  locate: 'searching',
  curl: 'web',
  wget: 'web',
  http: 'web',
  https: 'web',
}

const WRITERS = new Set(['cat', 'echo', 'printf'])

// The command that does the work: the first one, past what leads up to it.
function programOf(command: string): { name: string; rest: string } {
  let rest = command

  while (LEAD.test(rest)) {
    rest = rest.replace(LEAD, '')
  }

  const word = /^[\w./+-]+/.exec(rest)?.[0] ?? ''

  return { name: word.split('/').pop() ?? word, rest }
}

// Which scene a shell command is: a test run or an install wherever it stands
// in the line, else by the first command, so `cat x | grep y` is reading.
function activityOfCommand(command: string): Activity {
  if (TESTS.test(command)) {
    return 'testing'
  }

  const { name, rest } = programOf(command)

  if (name === 'git' || name === 'gh') {
    return 'git'
  }

  if (INSTALL.test(command)) {
    return 'installing'
  }

  const line = rest.split('\n')[0] ?? rest

  if (name === 'tee' || (name === 'sed' && /\s-i\b/.test(line)) || (WRITERS.has(name) && TO_FILE.test(line))) {
    return 'coding'
  }

  return BY_COMMAND[name] ?? 'terminal'
}

// Whether the scene of a call to this tool depends on its arguments.
export function isShell(tool: string): boolean {
  return tool === 'Bash'
}

// Which scene a call is: by the tool, and for a command or a file by what it
// is about (`args` absent while the call's arguments are still streaming).
export function activityOf(tool: string, args?: Readonly<Record<string, unknown>>): Activity {
  const known = BY_TOOL[tool]
  const command = args?.command
  const path = args?.file_path

  if (isShell(tool) && typeof command === 'string') {
    return activityOfCommand(command)
  }

  if (known === 'coding' && typeof path === 'string' && MEMORY.test(path)) {
    return 'memory'
  }

  if (known !== undefined) {
    return known
  }

  if (/browser|chrome/i.test(tool)) {
    return 'web'
  }

  if (/terminal/i.test(tool)) {
    return 'terminal'
  }

  if (/search|find|query/i.test(tool)) {
    return 'searching'
  }

  return 'tool'
}
