import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, Timer } from 'claude-code'

import type { Activity, Crew, CrewBand, CrewView, Meter, Scene } from '../types'
import type { Helper, Lingering } from './activity'
import {
  activityOf,
  activityOfStreaming,
  helpersLine,
  isHandback,
  isToldByArgs,
  opensDesign,
  sceneOfLingering,
  whole,
} from './activity'
import { NO_BAND, NO_CREW, amend, bandOf, finish, isWorking as isCrewWorking, join, leave, sampleCrew, step, workflowNameOf } from './crew'
import { meterAlt, meterLines, meterRow, meterSvg, meterWidth } from './meter'
import { PANE, PANE_TITLE, crabRow, crewTree, groupKey, stepsKey } from './pane'
import { BAND_CREW, CRAB_WIDTH, CREW_GLYPH, PROP_WIDTH, SCENE_HEIGHT, crabSvg, crewSvg, propSvg, resumed, sceneRows } from './scenes'

const COMMAND = 'crab-cam'
const REST_AFTER_MS = 8000
const TICK_MS = 600
// The detail may run on to a second line: the layout cuts whatever is wider
// than the room before the shell, so the limit only keeps it to two lines.
const DETAIL_LENGTH = 140
// A detail up to this long is taken to fit on one line.
const ONE_LINE = 60
// How long a tool's scene stays up at least, so a call that returns at once
// is still seen; a failure stays longer.
const HOLD_MS = 1200
const ERROR_HOLD_MS = 2500
const MAX_HELD = 3
// How long the last tool's scene stays once the tool is through before the
// crab goes back to thinking: the model's pause between two calls is mostly
// shorter, and the work then reads as one stretch of reading or searching.
const THINK_AFTER_MS = 5000
const DEMO_MS = 3000
// How often the elapsed times on the crew's cards move on.
const CREW_CLOCK_MS = 1000
const DEMO_DETAIL = 'demo'
const DEMO: readonly Activity[] = [
  'thinking',
  'reading',
  'coding',
  'writing',
  'designing',
  'terminal',
  'testing',
  'git',
  'installing',
  'searching',
  'web',
  'delegating',
  'planning',
  'skill',
  'memory',
  'tool',
  'sharing',
  'waiting',
  'permission',
  'error',
  'compacting',
  'talking',
  'asking',
  'done',
]

const scene = atom({ plugin: 'crab-cam', key: 'scene' } as const, { activity: 'idle', detail: '' })
const isHidden = atom({ plugin: 'crab-cam', key: 'isHidden' } as const, false)
const frame = atom({ plugin: 'crab-cam', key: 'frame' } as const, 0)
const meter = atom({ plugin: 'crab-cam', key: 'meter' } as const, { context: null, fiveHour: null, week: null })
const isMetered = atom({ plugin: 'crab-cam', key: 'isMetered' } as const, true)
const isDetailed = atom({ plugin: 'crab-cam', key: 'isDetailed' } as const, false)
// Whether a command shows as typed rather than by its description.
const isRaw = atom({ plugin: 'crab-cam', key: 'isRaw' } as const, false)
const crew = atom({ plugin: 'crab-cam', key: 'crew' } as const, NO_CREW)
const demoCrew = atom({ plugin: 'crab-cam', key: 'demoCrew' } as const, null as Crew | null)
const crewView = atom({ plugin: 'crab-cam', key: 'crewView' } as const, { open: [], folded: [] } as CrewView)
// Whether the pane opens by itself when a new round of helpers starts.
const isCrewAuto = atom({ plugin: 'crab-cam', key: 'isCrewAuto' } as const, false)
// The crew as the band shows it. The band reads this rather than the crew,
// whose every tick would draw it again.
const crewBand = atom({ plugin: 'crab-cam', key: 'crewBand' } as const, NO_BAND)

// The band's button that opens the pane while a crew works and it is closed.
const WATCH = 'watch-crew'
const WATCH_LABEL = 'Watch crew ↗'

// What the band draws of the crew: its crabs while one is at work, whether to
// offer the pane, and the time the crabs are drawn at.
type Watch = { band: CrewBand | undefined; isOffered: boolean; now: number }

const LABELS: Record<Activity, string> = {
  idle: 'Claude is resting',
  thinking: 'Claude is thinking',
  reading: 'Claude is reading',
  coding: 'Claude is writing code',
  writing: 'Claude is writing text',
  designing: 'Claude is designing',
  terminal: 'Claude is running a command',
  searching: 'Claude is searching',
  web: 'Claude is browsing the web',
  delegating: 'Claude has a crew at work',
  talking: 'Claude is writing a reply',
  asking: 'Claude has a question for you',
  planning: 'Claude is making a plan',
  tool: 'Claude is using a tool',
  done: 'Done!',
  permission: 'Claude is waiting for your permission',
  compacting: 'Claude is tidying up its memory',
  error: 'Oops, that went wrong',
  waiting: 'Claude is waiting on a background task',
  testing: 'Claude is running tests',
  git: 'Claude is working with git',
  installing: 'Claude is installing packages',
  skill: 'Claude is loading a skill',
  memory: 'Claude is remembering something',
  sharing: 'Claude is sharing something with you',
}

// A command comes with a description of what it does in plain words, the one
// the app shows too: that goes before the command itself.
const DETAIL_KEYS = ['file_path', 'notebook_path', 'description', 'command', 'pattern', 'query', 'url', 'skill'] as const
// The same with the command itself first, for who wants to see what runs.
const RAW_KEYS = ['file_path', 'notebook_path', 'command', 'pattern', 'query', 'url', 'description', 'skill'] as const

// A detail cut to what the band has room for.
function clip(text: string): string {
  return text.length > DETAIL_LENGTH ? `${text.slice(0, DETAIL_LENGTH - 1)}…` : text
}

// What the call is about, in a few words: the file's name, what the command
// does, the pattern.
function detailOf(tool: string, args: Readonly<Record<string, unknown>>, raw = false): string {
  for (const key of raw ? RAW_KEYS : DETAIL_KEYS) {
    const value = args[key]

    if (typeof value !== 'string' || value === '') {
      continue
    }

    const isPath = key === 'file_path' || key === 'notebook_path'

    return clip(isPath ? (value.split('/').pop() ?? value) : (value.split('\n')[0] ?? value))
  }

  return tool.startsWith('mcp__') ? (tool.split('__').pop() ?? '') : ''
}

// The arguments that say what a call is about before it is made, once all of
// one has arrived: the file written to, the skill, what a command does.
const EARLY_KEYS = ['file_path', 'skill', 'description'] as const
const RAW_EARLY_KEYS = ['file_path', 'skill', 'command'] as const

// What a call is about while its arguments are still arriving; nothing until
// one of the telling ones is whole.
function detailOfStreaming(tool: string, json: string, raw: boolean): string {
  for (const key of raw ? RAW_EARLY_KEYS : EARLY_KEYS) {
    const value = whole(json, key)

    if (value !== undefined) {
      return detailOf(tool, { [key]: value })
    }
  }

  return ''
}

type Painted = { activity: Activity; detail: string; hold: number }

type Call = { tool: string; activity: Activity; detail: string }

let isWorking = false
// Whether the conversation is being compacted: the crab tidies up until it is
// through, whatever comes and goes meanwhile.
let isCompacting = false
// Whether this turn has taken up design work, by a design skill or tool or
// the start of an artifact: a page written after that is designed, not coded.
let isDesigning = false
// The main loop's calls still running, by tool_use_id, in the order begun.
const calls = new Map<string, Call>()
let pending: Promise<unknown> = Promise.resolve()
let rest: Timer | undefined
let ticker: Timer | undefined
let demo: Timer | undefined
// Moves the demo's sample crew on while the demo plays, from when it began.
let demoCrewClock: Timer | undefined
let demoStarted: number | undefined
let muse: Timer | undefined
// The tool a permission dialog is open for, while one is.
let asking: string | undefined
// What the last stop of the main loop left running in the background.
let lingering: readonly Lingering[] = []
// The helpers at work, by agent id: subagents and a workflow's agents alike,
// each from its first event until its own turn ends, during a turn and after.
const helpers = new Map<string, Helper>()
// Runs while the helpers' line was drawn a moment ago; what changes meanwhile
// is drawn once it is through, so six helpers at once do not make it flicker.
let helperBeat: Timer | undefined
let isHelperLineStale = false
// The pane's crew is written one change after another, each with the time it
// was made, so a helper's first step never lands before the helper does.
let crewWrites: Promise<unknown> = Promise.resolve()
// The helpers the pane has taken on, so each is taken on once.
const enlisted = new Set<string>()
// The helpers whose end was heard: what comes from one after is left alone.
const finished = new Set<string>()
// The workflows called and not yet through, by name: a round with one of them
// goes on between its agents.
let runningWorkflows: readonly string[] = []
// Whether a workflow runs, named or not: called and not yet seen through.
let isWorkflowAfoot = false
// Whether a workflow was called while no helper was at work: its first agent
// starts a round of its own, even under a name the last round had.
let isRunCalled = false
// Runs while one of the crew is at work, moving its elapsed time on.
let crewClock: Timer | undefined
// The workflows called while no round of helpers runs: the next round's.
let upcoming: readonly string[] = []
// The scene on screen, the hold it is under, and what came in meanwhile.
let current: Painted | undefined
let busy: Timer | undefined
let held: Painted[] = []
let trailing: Painted | undefined

// The next scene due: held ones in the order made, then the latest unheld one.
function takeQueued(): Painted | undefined {
  const [first, ...others] = held
  held = others

  if (first !== undefined) {
    return first
  }

  const last = trailing
  trailing = undefined

  return last
}

// Brings the pane's time up to now: the demo's sample crew, or the real one
// when it has anyone. The pane's drawings are as far along as its last redraw
// says, and a redraw of the band draws the pane again from that last one: a
// pane last drawn a second ago would then show every crab a second back.
async function freshenPane($: EngineInterface): Promise<void> {
  const started = demoStarted

  if (started !== undefined) {
    const now = await $.clock.now()
    await update($, demoCrew, () => sampleCrew(started, now))
    await syncBand($)
  } else if ((await read($, crew)).members.length > 0) {
    await changeCrew($, (before, now) => ({ ...before, now }))
  }
}

// Brings the band's crew in line with the crew the pane shows, the demo's
// while it plays; written only when a helper joined or ended.
async function syncBand($: EngineInterface): Promise<void> {
  const shown = demoStarted === undefined ? await read($, crew) : ((await read($, demoCrew)) ?? NO_CREW)
  const next = bandOf(shown)

  if (JSON.stringify(await read($, crewBand)) !== JSON.stringify(next)) {
    await update($, crewBand, () => next)
  }
}

// Draws a scene, or queues it while the one on screen is still held. Writes
// run one after another and off the caller's path, so a stream of chunks
// never waits on the crab and two changes land in the order made.
function paint($: EngineInterface, activity: Activity, detail: string, hold = 0): void {
  const wanted: Painted = { activity, detail, hold }

  if (busy !== undefined) {
    if (hold > 0) {
      held = [...held, wanted].slice(-MAX_HELD)
      trailing = undefined
    } else {
      trailing = wanted
    }

    return
  }

  if (current?.activity !== activity || current.detail !== detail) {
    const next: Scene = { activity, detail }
    // The pane first, so the band's redraw finds it current.
    pending = pending
      .then(() => freshenPane($))
      .then(() => update($, scene, () => next))
      .catch(() => undefined)
  }

  current = wanted

  if (hold > 0) {
    busy = $.clock.after(hold, () => {
      busy = undefined
      const due = takeQueued()

      if (due !== undefined) {
        paint($, due.activity, due.detail, due.hold)
      }
    })
  }
}

// Drops the hold on the scene on screen and what is queued behind it, so the
// next scene shows at once and nothing from before it shows after.
function flush(): void {
  busy?.cancel()
  busy = undefined
  held = []
  trailing = undefined
}

// What the session is doing; held back while the demo has the crab. Helpers
// at work show as how many there are and what they are doing, which says more
// than the description of the call that started them.
function show($: EngineInterface, activity: Activity, detail = '', hold = 0): void {
  if (demo === undefined) {
    const isCounted = activity === 'delegating' && helpers.size > 0
    paint($, activity, isCounted ? clip(helpersLine([...helpers.values()])) : detail, hold)
  }
}

function stopMusing(): void {
  muse?.cancel()
  muse = undefined
}

// Back to thinking once nothing new has come for a while.
function museLater($: EngineInterface): void {
  stopMusing()
  muse = $.clock.after(THINK_AFTER_MS, () => {
    muse = undefined

    if (isWorking && calls.size === 0) {
      show($, 'thinking')
    }
  })
}

// Only the terminal's glyph scenes are animated by a tick; the desktop's
// drawing animates itself.
async function startTicking($: EngineInterface): Promise<void> {
  if (ticker === undefined && (await $.session.surfaces()).includes('terminal')) {
    ticker = $.clock.every(TICK_MS, () => {
      void update($, frame, tick => (tick + 1) % 60).catch(() => undefined)
    })
  }
}

function stopTicking(): void {
  ticker?.cancel()
  ticker = undefined
}

// The scene between turns: the background work still going, or rest.
function settle($: EngineInterface): void {
  if (helpers.size > 0) {
    show($, 'delegating')

    return
  }

  // A subagent's end is heard as it happens, so one the stop still listed is
  // through by now; a workflow may be between two of its agents.
  const scene = sceneOfLingering(lingering.filter(task => task.type !== 'subagent'))

  if (scene === undefined) {
    stopTicking()
    show($, 'idle')
  } else {
    show($, scene.activity, clip(scene.detail))
  }
}

// The scene of a turn under way: the call still running that began last, else
// thinking.
function resume($: EngineInterface): void {
  const last = [...calls.values()].pop()

  if (last === undefined) {
    show($, 'thinking')
  } else {
    show($, last.activity, last.detail)
  }
}

// Back to what the session is doing, after something else had the crab.
function restore($: EngineInterface): void {
  if (isWorking) {
    resume($)
  } else {
    settle($)
  }
}

// Draws the helpers' line where the crab is on helpers: during a turn only
// while the scene is theirs already, between turns whenever the crab is settled.
function drawHelpers($: EngineInterface): void {
  if (isCompacting) {
    return
  }

  if (!isWorking) {
    if (rest === undefined) {
      settle($)
    }
  } else if (current?.activity === 'delegating') {
    if (helpers.size > 0) {
      show($, 'delegating')
    } else {
      resume($)
    }
  }
}

// A helper came, went or took up something else.
function helpersChanged($: EngineInterface): void {
  if (helperBeat !== undefined) {
    isHelperLineStale = true

    return
  }

  drawHelpers($)
  helperBeat = $.clock.after(HOLD_MS, () => {
    helperBeat = undefined

    if (isHelperLineStale) {
      isHelperLineStale = false
      helpersChanged($)
    }
  })
}

// Takes note of a helper: that it is there, and what is new about it.
function noteHelper($: EngineInterface, id: string, news: Partial<Helper> = {}): void {
  if (finished.has(id)) {
    return
  }

  const before = helpers.get(id)
  const now: Helper = { activity: 'thinking', ...before, ...news }
  helpers.set(id, now)

  if (before?.activity !== now.activity || before.about !== now.about) {
    helpersChanged($)
  }
}

function dropHelper($: EngineInterface, id: string): void {
  finished.add(id)

  if (helpers.delete(id)) {
    helpersChanged($)
  }
}

// Drops the helpers that are through without their end having been heard, as
// after a crash or a reload: those the engine lists as no longer running, and
// those it does not list at all, a workflow's, once no workflow is left
// running. The pane's cards count too, as a reload forgets who was at work.
async function pruneHelpers($: EngineInterface): Promise<void> {
  const working = (await read($, crew)).members.filter(member => member.phase === 'working').map(member => member.id)
  const ids = [...new Set([...helpers.keys(), ...working])]

  if (ids.length === 0) {
    return
  }

  const listed = await $.agent.list().catch(() => undefined)

  if (listed === undefined) {
    return
  }

  const hasWorkflow = lingering.some(task => task.type === 'workflow')

  for (const id of ids) {
    const info = listed.find(agent => agent.id === id)

    if (info === undefined ? !hasWorkflow : info.status !== 'running') {
      dropHelper($, id)
      const hasFailed = info !== undefined && info.status !== 'completed'
      void changeCrew($, (before, now) => amend(before, id, member => finish(member, hasFailed, now)))
    }
  }
}

function changeCrew($: EngineInterface, change: (before: Crew, now: number) => Crew): Promise<unknown> {
  crewWrites = crewWrites
    .then(async () => {
      const now = await $.clock.now()
      const after = await update($, crew, before => change(before, now))
      await syncBand($)

      return after
    })
    .catch(() => undefined)

  return crewWrites
}

function stopCrewClock(): void {
  crewClock?.cancel()
  crewClock = undefined
}

function startCrewClock($: EngineInterface): void {
  crewClock ??= $.clock.every(CREW_CLOCK_MS, () => {
    void changeCrew($, (before, now) => {
      if (!isCrewWorking(before)) {
        stopCrewClock()

        return before
      }

      return { ...before, now }
    })
  })
}

// Tells a subagent from a workflow's agent: the engine lists the first, never
// the second. Nor does it list its own forks, which are no one's crew: an
// agent it does not list counts as a workflow's once one is known to run, or
// once it has a type, which forks do not get.
async function sortMember($: EngineInterface, id: string): Promise<void> {
  const listed = await $.agent.list().catch(() => undefined)
  const info = listed?.find(agent => agent.id === id)
  const hasWorkflow = lingering.some(task => task.type === 'workflow')

  await changeCrew($, before =>
    amend(before, id, member => {
      if (member.group !== null) return member
      if (info !== undefined) {
        return { ...member, group: 'subagent', about: member.about ?? (info.description || null), type: member.type ?? info.type }
      }

      return member.type !== null || hasWorkflow || before.workflows.length > 0 ? { ...member, group: 'workflow' } : member
    }),
  )
  // A fork stays in no group: it is no one's crew, and is no reason for a
  // round to go on.
  await changeCrew($, before => (before.members.some(member => member.id === id && member.group === null) ? leave(before, id) : before))
}

// Takes a helper on in the pane the first time it is heard of. The first of a
// new round clears the cards of the last, and opens the pane where that is on.
function enlist($: EngineInterface, id: string): void {
  if (enlisted.has(id)) {
    return
  }

  enlisted.add(id)
  let isNewRound = false
  void changeCrew($, (before, now) => {
    const joined = join(before, id, now, upcoming, goesOn(before))
    isNewRound = joined.isNewRound

    if (isNewRound) {
      upcoming = []
      isRunCalled = false
    }

    return joined.crew
  }).then(async () => {
    // The session it came in may have ended meanwhile.
    if (!enlisted.has(id)) {
      return
    }

    startCrewClock($)

    if (isNewRound && demo === undefined && (await read($, isCrewAuto))) {
      await $.ui.open({ id: PANE, title: PANE_TITLE }).catch(() => undefined)
    }

    await sortMember($, id)
  })
}

// Whether a round with no one at work goes on: a workflow of it still runs,
// by its name, or one without a name is afoot and the round has its agents.
// A workflow called since starts a round of its own.
function goesOn(before: Crew): boolean {
  if (isRunCalled) {
    return false
  }

  const hasAgents = before.members.some(member => member.group === 'workflow')

  return before.workflows.some(name => runningWorkflows.includes(name)) || (isWorkflowAfoot && hasAgents)
}

// A workflow was called, by name or not: the round under way takes it on, or
// the next one does when none is at work.
function calledWorkflow($: EngineInterface, name: string | undefined): void {
  isWorkflowAfoot = true

  if (name !== undefined) {
    runningWorkflows = runningWorkflows.includes(name) ? runningWorkflows : [...runningWorkflows, name]
  }

  void changeCrew($, before => {
    if (isCrewWorking(before)) {
      return name === undefined || before.workflows.includes(name) ? before : { ...before, workflows: [...before.workflows, name] }
    }

    isRunCalled = true
    upcoming = name === undefined || upcoming.includes(name) ? upcoming : [...upcoming, name]

    return before
  })
}

// A stop lists a workflow still running: the round it began in goes by its
// name, which a workflow called by its saved script never said; or the next
// round does, when none is under way.
function heardWorkflow($: EngineInterface, name: string): void {
  runningWorkflows = runningWorkflows.includes(name) ? runningWorkflows : [...runningWorkflows, name]
  void changeCrew($, before => {
    if (isCrewWorking(before) || goesOn(before)) {
      return before.workflows.includes(name) ? before : { ...before, workflows: [...before.workflows, name] }
    }

    upcoming = upcoming.includes(name) ? upcoming : [...upcoming, name]

    return before
  })
}

function stopTimers(): void {
  stopMusing()
  rest?.cancel()
  rest = undefined
}

// Walks every scene in turn, so each animation can be seen without a task
// that happens to raise it; the session's own scenes wait until it is through.
// Between turns nothing ticks, so the demo starts the tick itself; the crab
// at rest afterwards stops it again. The pane shows a sample crew meanwhile,
// and closes again after if the demo opened it.
async function playDemo($: EngineInterface): Promise<void> {
  demo?.cancel()
  demoCrewClock?.cancel()
  flush()
  let index = 0
  paint($, DEMO[0] ?? 'idle', DEMO_DETAIL)
  demoStarted = await $.clock.now()
  const wasOpen = (await $.ui.panes().catch(() => [])).some(pane => pane.id === PANE)
  await freshenPane($)
  await $.ui.open({ id: PANE, title: PANE_TITLE }).catch(() => undefined)
  await startTicking($)

  demoCrewClock = $.clock.every(CREW_CLOCK_MS, () => {
    void freshenPane($).catch(() => undefined)
  })

  demo = $.clock.every(DEMO_MS, () => {
    index += 1
    const activity = DEMO[index]

    if (activity === undefined) {
      demo?.cancel()
      demo = undefined
      demoCrewClock?.cancel()
      demoCrewClock = undefined
      demoStarted = undefined
      restore($)
      // A round that began meanwhile would have opened the pane by itself.
      void update($, demoCrew, () => null)
        .then(() => syncBand($))
        .then(async () => {
          const isKept = wasOpen || ((await read($, isCrewAuto)) && isCrewWorking(await read($, crew)))

          return isKept ? undefined : $.ui.close({ id: PANE })
        })
        .catch(() => undefined)

      return
    }

    paint($, activity, DEMO_DETAIL)
  })
}

// A list with the id taken out, or put in where it was not.
const toggled = (list: readonly string[], id: string): string[] =>
  list.includes(id) ? list.filter(one => one !== id) : [...list, id]

type Measured = {
  context: { percent?: number }
  rateLimits: readonly { kind: string; percentUsed: number }[]
}

// Takes a measurement of the session over into the meter, redrawing the band
// only when a figure the shell shows has moved.
async function gauge($: EngineInterface, measured: Measured): Promise<void> {
  const used = (kind: string) => {
    const limit = measured.rateLimits.find(one => one.kind === kind)

    return limit === undefined ? null : Math.round(limit.percentUsed)
  }
  const now: Meter = { context: measured.context.percent ?? null, fiveHour: used('five_hour'), week: used('seven_day') }
  const before = await read($, meter)

  if (before.context !== now.context || before.fiveHour !== now.fiveHour || before.week !== now.week) {
    await update($, meter, () => now)
  }
}

// The meter's readings spelled out as a small table: the labels dim in one
// column, the figures bold in the next, so the figures line up.
function readings(table: Elements['terminal'] | Elements['desktop'] | Elements['vscode'], gauged: Meter) {
  const { Box, Text } = table
  const lines = meterLines(gauged)

  return (
    <Box flexDirection="row" gap={2} flexShrink={0}>
      <Box flexDirection="column" flexShrink={0}>
        {lines.map(line => (
          <Text dimColor>{line.label}</Text>
        ))}
      </Box>
      <Box flexDirection="column" alignItems="flex-end" flexShrink={0}>
        {lines.map(line => (
          <Text bold>{line.value}</Text>
        ))}
      </Box>
    </Box>
  )
}

// The line under the label: a short one on one line and cut at the edge, a
// long one wrapped onto as many rows as it needs. No room is set aside for a
// second row, which would stand empty under a long one that fits on one.
function detailLine(table: Elements['terminal'] | Elements['desktop'], detail: string) {
  const { Text } = table

  return (
    <Text dimColor wrap={detail.length <= ONE_LINE ? 'truncate-end' : 'wrap'}>
      {detail === '' ? ' ' : detail}
    </Text>
  )
}

function terminalTree(
  table: Elements['terminal'],
  shown: Scene,
  tick: number,
  gauged: Meter | undefined,
  detailed: boolean,
  watch: Watch,
) {
  const { Box, Button, Text } = table
  const { activity, detail } = shown
  const rows = sceneRows(activity, tick)
  // The crew stands over the meter, on the line it leaves free, with Watch
  // crew under it: a column of its own beside the meter would cut the scene's
  // words short in a terminal of everyday width.
  const crew = watch.band === undefined ? undefined : (
    <Box flexDirection="row" gap={1}>
      {watch.band.crabs.slice(0, BAND_CREW).map(({ colour, phase }) => (
        <Box flexDirection="row">
          <Text color={colour}>{CREW_GLYPH}</Text>
          {phase === 'done' && <Text color="success">✓</Text>}
          {phase === 'failed' && <Text color="error">!</Text>}
        </Box>
      ))}
      {watch.band.crabs.length > BAND_CREW && <Text dimColor>{`+${watch.band.crabs.length - BAND_CREW}`}</Text>}
    </Box>
  )

  return (
    <Box flexDirection="row" gap={2} width="100%">
      <Box flexDirection="column" flexShrink={0}>
        {rows.crab.map((row, index) => crabRow(table, row, index, 'claude'))}
      </Box>
      <Box flexDirection="column" flexShrink={0}>
        {rows.prop.map(row => (
          <Text dimColor>{row === '' ? ' ' : row}</Text>
        ))}
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        {detail.length <= ONE_LINE && <Text> </Text>}
        <Text bold wrap="truncate-end">
          {LABELS[activity]}
        </Text>
        {detailLine(table, detail)}
      </Box>
      {(watch.band !== undefined || gauged !== undefined) && (
        <Box flexDirection="column" flexShrink={0}>
          {crew === undefined ? <Text> </Text> : crew}
          {gauged !== undefined && <Text color="claude">{meterRow(gauged)}</Text>}
          {watch.isOffered && (
            <Button key={WATCH} onPress={() => undefined}>
              {WATCH_LABEL}
            </Button>
          )}
        </Box>
      )}
      {gauged !== undefined && detailed && readings(table, gauged)}
    </Box>
  )
}

function desktopTree(
  table: Elements['desktop'] | Elements['vscode'],
  shown: Scene,
  gauged: Meter | undefined,
  detailed: boolean,
  watch: Watch,
) {
  const { Box, Button, Svg, Text } = table
  const row = watch.band === undefined ? undefined : crewSvg(watch.band)
  const { activity, detail } = shown
  const label = LABELS[activity]

  return (
    <Box flexDirection="row" alignItems="center" gap={2} width="100%">
      <Box flexDirection="row" gap={0} flexShrink={0}>
        <Svg source={crabSvg(activity)} alt="The Claude crab" width={CRAB_WIDTH} height={SCENE_HEIGHT} />
        <Svg
          source={propSvg(activity)}
          alt={detail === '' ? label : `${label}: ${detail}`}
          width={PROP_WIDTH}
          height={SCENE_HEIGHT}
        />
      </Box>
      <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
        <Text bold>{label}</Text>
        {detail !== '' && detailLine(table, detail)}
      </Box>
      {row !== undefined && watch.band !== undefined && (
        <Box flexDirection="row" alignItems="center" gap={1} flexShrink={0}>
          <Svg
            source={resumed(row.svg, (watch.now - watch.band.since) / 1000)}
            alt={`A crew of ${watch.band.crabs.length}`}
            width={row.width}
            height={row.height}
          />
          {watch.isOffered && (
            <Button key={WATCH} onPress={() => undefined}>
              {WATCH_LABEL}
            </Button>
          )}
        </Box>
      )}
      {gauged !== undefined && <Svg source={meterSvg(gauged)} alt={meterAlt(gauged)} width={meterWidth(gauged)} height={SCENE_HEIGHT} />}
      {gauged !== undefined && detailed && readings(table, gauged)}
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description:
        'Hide or show the crab; "demo" plays every scene, "meter" shows or hides the shell, "details" its readings in figures, "commands" shows commands as typed, "crew" opens or closes the Crab crew pane, "crew auto" whether it opens by itself',
      argumentHint: '[demo|meter|details|commands|crew|crew auto]',
    })

    // A reload in the middle of a turn finds the turn's scene in place and
    // leaves it; only a scene that was on its way to rest is put to rest.
    const stored = await read($, scene)

    if (stored.activity === 'done' || stored.activity === 'error') {
      show($, 'idle')
    }

    // Nor does it know the crew is at work: the cards' time goes on again.
    if (isCrewWorking(await read($, crew))) {
      startCrewClock($)
    }

    // The figures the session already has; later ones come with session.measure.
    void $.session
      .usage()
      .then(usage => gauge($, usage))
      .catch(() => undefined)

    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const argument = e.args.trim().split(/\s+/).join(' ')

    if (argument === 'crew') {
      if ((await $.ui.panes()).some(pane => pane.id === PANE)) {
        await $.ui.close({ id: PANE })

        return { text: 'The Crab crew pane is closed. /crab-cam crew opens it again.' }
      }

      await $.ui.open({ id: PANE, title: PANE_TITLE })

      return { text: 'The Crab crew pane is open: a card for every helper Claude puts to work.' }
    }

    if (argument === 'crew auto') {
      const auto = await update($, isCrewAuto, value => !value)

      return {
        text: auto
          ? 'The Crab crew pane now opens by itself when a new round of helpers starts.'
          : 'The Crab crew pane no longer opens by itself. Watch crew in the band or /crab-cam crew opens it.',
      }
    }

    if (argument === 'demo') {
      await update($, isHidden, () => false)
      await playDemo($)

      return {
        text: `The crab plays all ${DEMO.length} scenes, ${DEMO_MS / 1000} seconds each, with a sample crew in the Crab crew pane.`,
      }
    }

    if (argument === 'meter') {
      const metered = await update($, isMetered, value => !value)

      return {
        text: metered
          ? 'The shell is back at the right of the band. Everything fills as it is used: the ribs with the context, the row of five pearls with the 5-hour limit, the seven smaller ones below it with the week.'
          : 'The shell is gone. /crab-cam meter puts it back.',
      }
    }

    if (argument === 'details') {
      const detailed = await update($, isDetailed, value => !value)

      if (detailed) {
        await update($, isMetered, () => true)
      }

      return {
        text: detailed
          ? 'The readings are spelled out beside the shell. /crab-cam details hides them again.'
          : 'The readings are gone; the shell stays. /crab-cam details puts them back.',
      }
    }

    if (argument === 'commands') {
      const raw = await update($, isRaw, value => !value)

      return {
        text: raw
          ? 'Commands now show as typed. /crab-cam commands goes back to describing what they do.'
          : 'Commands are described by what they do again. /crab-cam commands shows them as typed.',
      }
    }

    const hidden = await update($, isHidden, value => !value)

    return { text: hidden ? 'The crab is hidden. Type /crab-cam to bring it back.' : 'The crab is back.' }
  })

  on('session.measure', async ($, e, next) => {
    await gauge($, e).catch(() => undefined)

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    stopTimers()
    isWorking = true
    isDesigning = false
    calls.clear()
    asking = undefined
    flush()
    show($, 'thinking')

    await startTicking($)

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const helper = e.agentId

    if (helper !== undefined) {
      noteHelper($, helper)
      enlist($, helper)
      const done = yield* next(e)
      const { usage } = done
      // What it has in hand: the whole prompt, cached or not, and the reply.
      const tokens =
        usage === null
          ? null
          : usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens + usage.output_tokens
      void changeCrew($, before =>
        amend(before, helper, member => ({ ...member, model: usage?.model ?? e.model, tokens: tokens ?? member.tokens })),
      )

      return done
    }

    // A reload in the middle of a turn has no turn.start to go by.
    isWorking = true
    // The calls of this response whose arguments are still arriving and say
    // what the call is about, by block: the tool and what has arrived, until
    // it settles the scene.
    const arriving = new Map<number, { tool: string; json: string; activity?: Activity }>()
    const raw = await read($, isRaw)

    for await (const chunk of next(e)) {
      if (chunk.kind === 'thinking') {
        // Right after a tool the thinking is the short pause before the next
        // call: the tool's scene stays until the pause has lasted.
        if (muse === undefined && calls.size === 0) {
          show($, 'thinking')
        }
      } else if (chunk.kind === 'text' && chunk.text.trim() !== '') {
        stopMusing()
        show($, 'talking')
      } else if (chunk.kind === 'tool') {
        stopMusing()

        // What a command or an edit is about shows only in its arguments: the
        // scene waits for enough of them, rather than passing through a
        // generic one.
        if (isToldByArgs(chunk.name)) {
          arriving.set(chunk.index, { tool: chunk.name, json: '' })
        } else {
          show($, activityOf(chunk.name))
        }
      } else if (chunk.kind === 'input') {
        const before = arriving.get(chunk.index)

        if (before !== undefined) {
          const json = before.json + chunk.json
          const activity = before.activity ?? activityOfStreaming(before.tool, json, isDesigning)
          const detail = activity === undefined ? '' : detailOfStreaming(before.tool, json, raw)

          // The scene shows as soon as it is settled, and what it is about
          // as soon as that is in: a command's description comes after the
          // command, which may be seconds later.
          if (detail === '') {
            arriving.set(chunk.index, { tool: before.tool, json, activity })
          } else {
            arriving.delete(chunk.index)
          }

          if (activity !== undefined && (before.activity === undefined || detail !== '')) {
            show($, activity, detail)
          }
        }
      }

      yield chunk
    }
  })

  on('tool.call', async ($, e, next) => {
    const args = e as unknown as Readonly<Record<string, unknown>>

    const helper = e.agentId

    if (helper !== undefined) {
      const isOwnWork = !isHandback(e.tool)
      const activity = activityOf(e.tool, args)
      noteHelper($, helper, isOwnWork ? { activity } : {})
      enlist($, helper)

      // A card names what a call was about as the call has it: the command a
      // step ran rather than what it was for, so it reads as done.
      if (isOwnWork) {
        const detail = detailOf(e.tool, args, true)
        void changeCrew($, (before, now) => amend(before, helper, member => step(member, activity, detail, now)))
      }

      return next(e)
    }

    if (e.tool === 'Workflow') {
      calledWorkflow($, workflowNameOf(args))
    }

    isDesigning ||= opensDesign(e.tool, args)
    const activity = activityOf(e.tool, args, isDesigning)
    const detail = detailOf(e.tool, args, await read($, isRaw))
    let hasFailed = false
    calls.set(e.tool_use_id, { tool: e.tool, activity, detail })
    stopMusing()
    show($, activity, detail, HOLD_MS)

    try {
      const ran = await next(e)
      hasFailed = ran.deny === undefined && ran.isError === true

      return ran
    } finally {
      calls.delete(e.tool_use_id)
      const wasAsked = asking === e.tool

      if (wasAsked) {
        asking = undefined
      }

      // A call that returns once its turn is over, as on an interrupt, says
      // nothing of the session any more.
      if (isWorking) {
        if (hasFailed) {
          show($, 'error', detail, ERROR_HOLD_MS)
        }

        // A dialog still open for another call keeps the crab.
        if (asking === undefined) {
          if (calls.size > 0) {
            resume($)
          } else {
            if (wasAsked && !hasFailed) {
              show($, activity, detail)
            }

            museLater($)
          }
        }
      }
    }
  })

  // The dialog is on screen from here until the person answers; nothing says
  // when they did, so the scene stays until the call itself returns. A
  // subagent's dialog is not the main loop's, and a question or a plan put to
  // the person is asking, not permission.
  on('classic.PermissionRequest', ($, e, next) => {
    if (e.agent_id !== undefined) {
      return next(e)
    }

    asking = e.tool_name

    if (activityOf(e.tool_name) === 'asking' || e.tool_name === 'ExitPlanMode') {
      show($, 'asking')
    } else {
      show($, 'permission', e.tool_name)
    }

    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    if (e.agentId !== undefined || e.trigger === 'precompute') {
      return next(e)
    }

    // A compaction queued behind a turn starts as it ends: the rest that turn
    // had coming would otherwise put the crab to rest in the middle of it.
    stopTimers()
    isCompacting = true
    show($, 'compacting', '', HOLD_MS)

    try {
      return await next(e)
    } finally {
      isCompacting = false
      restore($)
    }
  })

  // A helper is there from the moment it starts, seconds before its first call.
  on('classic.SubagentStart', ($, e, next) => {
    const id = e.agent_id
    const type = e.agent_type
    noteHelper($, id)
    enlist($, id)

    if (type !== undefined && type !== '') {
      void changeCrew($, before => amend(before, id, member => ({ ...member, type: member.type ?? type }))).then(() =>
        sortMember($, id),
      )
    }

    return next(e)
  })

  // The call that starts a helper says what it is for. A workflow starts its
  // agents the same way, under the labels it gave them; the engine lists a
  // subagent and never a workflow's agent, which tells the two apart.
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)

    const id = started.agentId

    if (id !== undefined) {
      // A fork is not listed either, and is the model's own.
      const listed = e.fork || !isWorkflowAfoot ? undefined : await $.agent.list().catch(() => undefined)
      const isWorkflows = listed !== undefined && !listed.some(agent => agent.id === id)
      const about = e.description !== '' ? e.description : isWorkflows ? null : e.subagentType
      noteHelper($, id, about === null ? {} : { about })
      enlist($, id)
      // One taken for a fork before the engine listed it joins again.
      void changeCrew($, (before, now) =>
        amend(join(before, id, now, [], true).crew, id, member => ({
          ...member,
          group: isWorkflows ? 'workflow' : 'subagent',
          about,
          type: e.subagentType || member.type,
          model: member.model ?? started.model,
        })),
      )
    }

    return started
  })

  // A helper's own turn ends once, whether it answered, failed or was stopped.
  on('turn.complete', ($, e, next) => {
    const helper = e.agentId

    if (helper !== undefined) {
      dropHelper($, helper)
      const hasFailed = e.isAborted || e.reason !== 'answer'
      void changeCrew($, (before, now) => amend(before, helper, member => finish(member, hasFailed, now)))

      return next(e)
    }

    stopTimers()
    isWorking = false
    calls.clear()
    asking = undefined
    // Nothing of the turn shows once it is over.
    flush()

    // With helpers still at work the turn is not done: the crab stays on
    // them until they return.
    if (e.isAborted || helpers.size > 0) {
      settle($)
    } else {
      // A refusal or an API error ended the turn too, but nothing is done.
      show($, e.reason === 'answer' ? 'done' : 'error')
      rest = $.clock.after(REST_AFTER_MS, () => {
        rest = undefined

        if (!isWorking) {
          settle($)
        }
      })
    }

    return next(e)
  })

  // `/clear`, `/resume` and the end of the session: what the crab knew of the
  // conversation is gone with it.
  on('session.end', ($, e, next) => {
    stopTimers()
    stopTicking()
    demo?.cancel()
    demo = undefined
    demoCrewClock?.cancel()
    demoCrewClock = undefined
    demoStarted = undefined
    flush()
    isWorking = false
    isDesigning = false
    calls.clear()
    asking = undefined
    lingering = []
    helpers.clear()
    helperBeat?.cancel()
    helperBeat = undefined
    isHelperLineStale = false
    enlisted.clear()
    finished.clear()
    upcoming = []
    runningWorkflows = []
    isWorkflowAfoot = false
    isRunCalled = false
    stopCrewClock()
    void changeCrew($, () => NO_CREW)
    void update($, demoCrew, () => null).catch(() => undefined)
    paint($, 'idle', '')

    return next(e)
  })

  // The turn may be over while a command or a helper it started runs on: the
  // crab then keeps at it rather than resting, until the next turn begins.
  on('classic.Stop', ($, e, next) => {
    lingering = e.background_tasks ?? []
    // The workflows still running are those the stop lists.
    runningWorkflows = []
    isWorkflowAfoot = lingering.some(task => task.type === 'workflow')

    for (const task of lingering) {
      if (task.type === 'workflow' && task.name !== undefined && task.name !== '') {
        heardWorkflow($, task.name)
      }
    }

    void pruneHelpers($)

    if (!isWorking && rest === undefined) {
      settle($)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) {
      return next(e)
    }

    const shown = await read($, scene)
    const gauged = (await read($, isMetered)) ? await read($, meter) : undefined
    const detailed = await read($, isDetailed)
    // A crew at work stands beside the crab, and can be watched until its pane
    // is on screen.
    const band = await read($, crewBand)
    const isOut = band.crabs.some(crab => crab.phase === 'working')
    const watch: Watch = {
      band: isOut ? band : undefined,
      isOffered: isOut && !(await $.ui.panes().catch(() => [])).some(pane => pane.id === PANE && pane.isShown),
      now: isOut ? await $.clock.now() : 0,
    }

    if (e.surface === 'terminal') {
      return terminalTree($.ui.resolve(e), shown, await read($, frame), gauged, detailed, watch)
    }

    // VS Code draws the same tree as the desktop: it has every element it uses.
    if (e.surface === 'desktop' || e.surface === 'vscode') {
      return desktopTree($.ui.resolve(e), shown, gauged, detailed, watch)
    }

    return next(e)
  })

  // The demo's sample crew stands in for the real one while it plays.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const shown = (await read($, demoCrew)) ?? (await read($, crew))

    return crewTree($.ui.resolve(e), e.surface, shown, await read($, crewView), await read($, frame), await $.clock.now())
  })

  // The band's Watch crew opens the pane, and the band is drawn again without
  // it. A card's steps unfold and fold again, and so does a group.
  on('ui.press', { plugin: 'crab-cam' }, async ($, e, next) => {
    const [steps, group] = [stepsKey(''), groupKey('')]

    if (e.element === WATCH) {
      await $.ui.open({ id: PANE, title: PANE_TITLE })
      $.ui.invalidate('ui.render')

      return { element: e.element }
    }

    if (e.element.startsWith(steps)) {
      const id = e.element.slice(steps.length)
      await update($, crewView, view => ({ ...view, open: toggled(view.open, id) }))

      return { element: e.element }
    }

    if (e.element.startsWith(group)) {
      const key = e.element.slice(group.length)
      await update($, crewView, view => ({ ...view, folded: toggled(view.folded, key) }))

      return { element: e.element }
    }

    return next(e)
  })
}
