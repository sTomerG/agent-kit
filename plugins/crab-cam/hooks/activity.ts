import type { Activity } from '../types'

const BY_TOOL: Record<string, Activity> = {
  Read: 'reading',
  NotebookRead: 'reading',
  ReadMcpResourceTool: 'reading',
  ListMcpResourcesTool: 'reading',
  ReadMcpResourceDirTool: 'reading',
  ReadNotifications: 'reading',
  FetchInboxMessage: 'reading',
  Skill: 'skill',
  Edit: 'coding',
  MultiEdit: 'coding',
  Write: 'coding',
  NotebookEdit: 'coding',
  Bash: 'terminal',
  KillShell: 'terminal',
  TaskStop: 'terminal',
  BashOutput: 'waiting',
  TaskOutput: 'waiting',
  Monitor: 'waiting',
  ScheduleWakeup: 'waiting',
  CronCreate: 'waiting',
  CronList: 'waiting',
  CronDelete: 'waiting',
  Grep: 'searching',
  Glob: 'searching',
  LS: 'searching',
  ToolSearch: 'searching',
  ListSkills: 'searching',
  ListPlugins: 'searching',
  ListAgents: 'searching',
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
  TaskList: 'planning',
  TaskGet: 'planning',
  EnterPlanMode: 'planning',
  ExitPlanMode: 'planning',
  Artifact: 'sharing',
  SendUserFile: 'sharing',
  PushNotification: 'sharing',
  ReportFindings: 'sharing',
  SuggestSkills: 'sharing',
  SuggestPluginInstall: 'sharing',
  EnterWorktree: 'git',
  ExitWorktree: 'git',
}

const TESTS = /\b(pytest|vitest|jest|mocha|rspec|phpunit|tox|unittest|(go|cargo|bun|deno|dotnet) test|(npm|pnpm|yarn)( run)? test)\b/
const INSTALL =
  /\b((npm|pnpm|yarn|bun) (install|add|i|ci)|pip3? install|uv (add|sync|pip)|poetry (add|install)|brew install|cargo (add|install)|apt(-get)? install)\b/
// Files that hold prose rather than code: by their extension, or by the names
// that go without one.
const PROSE =
  /\.(md|mdx|markdown|txt|rst|adoc|asciidoc|org|tex|rtf)$|(^|\/)(README|LICEN[CS]E|CHANGELOG|CONTRIBUTING|AUTHORS|NOTICE|TODO)$/i
// Files that hold how something looks: stylesheets and drawings.
const LOOKS = /\.(css|scss|sass|less|svg)$/i
// Files that hold a page: code in a web project, but a design once the turn
// has taken up design work, as when the page of an artifact is written.
const PAGE = /\.(html?|xhtml)$/i
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
function activityOfCommand(command: string, isDesigning: boolean): Activity {
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
    const words = line.split(/\s+/).map(word => word.replace(/^['"]|['"]$/g, ''))

    const looks = (word: string) => LOOKS.test(word) || (isDesigning && PAGE.test(word))

    return words.some(word => PROSE.test(word)) ? 'writing' : words.some(looks) ? 'designing' : 'coding'
  }

  return BY_COMMAND[name] ?? 'terminal'
}

// The command in a shell call's arguments while their JSON is still arriving:
// what there is of it so far, or nothing before it has begun.
function commandSoFar(json: string): string | undefined {
  const written = /"command"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(json)?.[1]

  return written?.replace(/\\(.)/g, (_, escaped: string) => (escaped === 'n' ? '\n' : escaped === 't' ? '\t' : escaped))
}

// The argument that settles the scene of a call to a tool other than the
// shell: the file an edit is to, the skill loaded, what an artifact call does.
const TELLING: Record<string, string> = {
  Edit: 'file_path',
  MultiEdit: 'file_path',
  Write: 'file_path',
  Skill: 'skill',
  Artifact: 'action',
}

// A string argument once all of it has arrived.
export function whole(json: string, key: string): string | undefined {
  return new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(json)?.[1]?.replace(/\\(.)/g, '$1')
}

// Which scene a call is while its arguments are still arriving, once what has
// arrived settles it: a long command or a whole file is on its way for
// seconds, and the crab should not sit on the scene before it. Nothing while
// the command's first word is not whole yet, or says nothing by itself.
export function activityOfStreaming(tool: string, json: string, isDesigning = false): Activity | undefined {
  const key = TELLING[tool]

  if (key !== undefined) {
    const value = whole(json, key)

    return value === undefined ? undefined : activityOf(tool, { [key]: value }, isDesigning)
  }

  const command = commandSoFar(json)

  if (command === undefined) {
    return undefined
  }

  const { name, rest } = programOf(command)

  if (!/^[\w./+-]+\s/.test(rest) || name === 'cd' || name === 'pushd') {
    return undefined
  }

  const activity = activityOfCommand(command, isDesigning)

  // The file a command writes to tells code from prose, and is in once its line is.
  if ((activity === 'coding' || activity === 'writing' || activity === 'designing') && !command.includes('\n')) {
    return undefined
  }

  // A plain command only once enough of it is in to tell it is no more.
  return activity !== 'terminal' || command.length >= 40 || command.includes('\n') ? activity : undefined
}

function isShell(tool: string): boolean {
  return tool === 'Bash'
}

// Whether the scene of a call to this tool depends on its arguments.
export function isToldByArgs(tool: string): boolean {
  return isShell(tool) || tool in TELLING
}

// Which scene a call is: by the tool, and for a command or a file by what it
// is about (`args` absent while the call's arguments are still streaming).
// `isDesigning` says the turn has taken up design work, which makes a page
// written from then on part of the design.
export function activityOf(tool: string, args?: Readonly<Record<string, unknown>>, isDesigning = false): Activity {
  const known = BY_TOOL[tool]
  const command = args?.command
  const path = args?.file_path

  if (isShell(tool) && typeof command === 'string') {
    return activityOfCommand(command, isDesigning)
  }

  if (known === 'coding' && typeof path === 'string' && MEMORY.test(path)) {
    return 'memory'
  }

  if (known === 'coding' && typeof path === 'string' && PROSE.test(path)) {
    return 'writing'
  }

  if (known === 'coding' && typeof path === 'string' && (LOOKS.test(path) || (isDesigning && PAGE.test(path)))) {
    return 'designing'
  }

  // A design tool or a skill for designing or drawing, whatever else its name says.
  if (/design|figma/i.test(tool) || (tool === 'Skill' && typeof args?.skill === 'string' && /design|diagram/i.test(args.skill))) {
    return 'designing'
  }

  // An artifact is designed before it is shared: the quickstart call hands
  // over the design guidance the page is then written to.
  if (tool === 'Artifact' && args?.action === 'quickstart') {
    return 'designing'
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

  // A tool the table does not know, an MCP server's mostly: by the verb its
  // own name opens with (`mcp__server__search_issues` is `search_issues`).
  const name = tool.split('__').pop() ?? tool

  if (/search|find|query/i.test(name)) {
    return 'searching'
  }

  if (/^(get|read|list|fetch|view)/i.test(name)) {
    return 'reading'
  }

  if (/^(show|display|render|open)/i.test(name)) {
    return 'sharing'
  }

  return 'tool'
}

// Whether a call takes up design work: a design tool, a design skill or the
// start of an artifact. An edit to a stylesheet alone does not, as any web
// project has those.
export function opensDesign(tool: string, args?: Readonly<Record<string, unknown>>): boolean {
  return !isShell(tool) && BY_TOOL[tool] !== 'coding' && activityOf(tool, args) === 'designing'
}

// A task still running in the background once the turn is over.
export type Lingering = { type: string; description: string; command?: string }

// A subscription that stays open for as long as the session does, such as the
// live updates of a published artifact. Nothing is in progress, so it must not
// keep the crab from resting.
function isStanding(task: Lingering): boolean {
  return /^live updates for /i.test(task.description)
}

// What the crab shows once a turn is over while work goes on in the
// background: helpers at work when every task is a subagent or a workflow,
// waiting otherwise; nothing when no task is left, and the crab may rest.
export function sceneOfLingering(all: readonly Lingering[]): { activity: Activity; detail: string } | undefined {
  const tasks = all.filter(task => !isStanding(task))
  const [first] = tasks

  if (first === undefined) {
    return undefined
  }

  const isDelegated = tasks.every(task => task.type === 'subagent' || task.type === 'workflow')
  const about = (first.command ?? first.description).split('\n')[0] ?? ''

  return {
    activity: isDelegated ? 'delegating' : 'waiting',
    detail: tasks.length === 1 ? about : `${tasks.length} tasks in the background`,
  }
}
