import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, Timer } from 'claude-code'

import type { Activity, Meter, Scene } from '../types'
import { activityOf, isShell } from './activity'
import { meterAlt, meterLines, meterRow, meterSvg, meterWidth } from './meter'
import { CRAB_WIDTH, PROP_WIDTH, SCENE_HEIGHT, crabSvg, propSvg, sceneRows } from './scenes'

const COMMAND = 'crab-cam'
const REST_AFTER_MS = 8000
const TICK_MS = 600
const DETAIL_LENGTH = 60
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
const DEMO_DETAIL = 'demo'
const DEMO: readonly Activity[] = [
  'thinking',
  'reading',
  'coding',
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

const LABELS: Record<Activity, string> = {
  idle: 'Claude is resting',
  thinking: 'Claude is thinking',
  reading: 'Claude is reading',
  coding: 'Claude is writing code',
  terminal: 'Claude is running a command',
  searching: 'Claude is searching',
  web: 'Claude is browsing the web',
  delegating: 'Claude is putting helpers to work',
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

const DETAIL_KEYS = ['file_path', 'notebook_path', 'command', 'pattern', 'query', 'url', 'description', 'skill'] as const

// What the call is about, in a few words: the file's name, the command, the pattern.
function detailOf(tool: string, args: Readonly<Record<string, unknown>>): string {
  for (const key of DETAIL_KEYS) {
    const value = args[key]

    if (typeof value !== 'string' || value === '') {
      continue
    }

    const isPath = key === 'file_path' || key === 'notebook_path'
    const text = isPath ? (value.split('/').pop() ?? value) : (value.split('\n')[0] ?? value)

    return text.length > DETAIL_LENGTH ? `${text.slice(0, DETAIL_LENGTH - 1)}…` : text
  }

  return tool.startsWith('mcp__') ? (tool.split('__').pop() ?? '') : ''
}

type Painted = { activity: Activity; detail: string; hold: number }

let isWorking = false
let running = 0
let pending: Promise<unknown> = Promise.resolve()
let rest: Timer | undefined
let ticker: Timer | undefined
let demo: Timer | undefined
let muse: Timer | undefined
let isAsking = false
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
    pending = pending.then(() => update($, scene, () => next)).catch(() => undefined)
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

// What the session is doing; held back while the demo has the crab.
function show($: EngineInterface, activity: Activity, detail = '', hold = 0): void {
  if (demo === undefined) {
    paint($, activity, detail, hold)
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

    if (isWorking && running === 0) {
      show($, 'thinking')
    }
  })
}

function stopTimers(): void {
  stopMusing()
  rest?.cancel()
  ticker?.cancel()
  rest = undefined
  ticker = undefined
}

// Walks every scene in turn, so each animation can be seen without a task
// that happens to raise it; the session's own scenes wait until it is through.
function playDemo($: EngineInterface): void {
  demo?.cancel()
  let index = 0
  paint($, DEMO[0] ?? 'idle', DEMO_DETAIL)

  demo = $.clock.every(DEMO_MS, () => {
    index += 1
    const activity = DEMO[index]

    if (activity === undefined) {
      demo?.cancel()
      demo = undefined
      paint($, isWorking ? 'thinking' : 'idle', '')

      return
    }

    paint($, activity, DEMO_DETAIL)
  })
}

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
function readings(table: Elements['terminal'] | Elements['desktop'], gauged: Meter) {
  const { Box, Text } = table
  const lines = meterLines(gauged)

  return (
    <Box flexDirection="row" gap={2} flexShrink={0}>
      <Box flexDirection="column" flexShrink={0}>
        {lines.map(line => (
          <Text dimColor>{line.label}</Text>
        ))}
      </Box>
      <Box flexDirection="column" flexShrink={0}>
        {lines.map(line => (
          <Text bold>{line.value}</Text>
        ))}
      </Box>
    </Box>
  )
}

function terminalTree(
  table: Elements['terminal'],
  shown: Scene,
  tick: number,
  gauged: Meter | undefined,
  detailed: boolean,
) {
  const { Box, Text } = table
  const { activity, detail } = shown
  const rows = sceneRows(activity, tick)

  return (
    <Box flexDirection="row" gap={2} width="100%">
      <Box flexDirection="column" flexShrink={0}>
        {rows.crab.map(row => (
          <Text color="claude">{row}</Text>
        ))}
      </Box>
      <Box flexDirection="column" flexShrink={0}>
        {rows.prop.map(row => (
          <Text dimColor>{row === '' ? ' ' : row}</Text>
        ))}
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        <Text> </Text>
        <Text bold wrap="truncate-end">
          {LABELS[activity]}
        </Text>
        <Text dimColor wrap="truncate-end">
          {detail === '' ? ' ' : detail}
        </Text>
      </Box>
      {gauged !== undefined && (
        <Box flexDirection="column" flexShrink={0}>
          <Text> </Text>
          <Text color="claude">{meterRow(gauged)}</Text>
        </Box>
      )}
      {gauged !== undefined && detailed && readings(table, gauged)}
    </Box>
  )
}

function desktopTree(table: Elements['desktop'], shown: Scene, gauged: Meter | undefined, detailed: boolean) {
  const { Box, Svg, Text } = table
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
      <Box flexDirection="column" flexGrow={1}>
        <Text bold>{label}</Text>
        {detail !== '' && (
          <Text dimColor wrap="truncate-end">
            {detail}
          </Text>
        )}
      </Box>
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
        'Hide or show the crab; "demo" plays every scene, "meter" shows or hides the shell, "details" its readings in figures',
      argumentHint: '[demo|meter|details]',
    })
    show($, 'idle')
    // The figures the session already has; later ones come with session.measure.
    void $.session
      .usage()
      .then(usage => gauge($, usage))
      .catch(() => undefined)

    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const argument = e.args.trim()

    if (argument === 'demo') {
      await update($, isHidden, () => false)
      playDemo($)

      return { text: `The crab plays all ${DEMO.length} scenes, ${DEMO_MS / 1000} seconds each.` }
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
    running = 0
    isAsking = false
    show($, 'thinking')

    // Only the terminal's glyph scenes are animated by a tick; the desktop's
    // drawing animates itself.
    if ((await $.session.surfaces()).includes('terminal')) {
      ticker = $.clock.every(TICK_MS, () => {
        void update($, frame, tick => (tick + 1) % 60).catch(() => undefined)
      })
    }

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) {
      return yield* next(e)
    }

    for await (const chunk of next(e)) {
      if (chunk.kind === 'thinking') {
        // Right after a tool the thinking is the short pause before the next
        // call: the tool's scene stays until the pause has lasted.
        if (muse === undefined && running === 0) {
          show($, 'thinking')
        }
      } else if (chunk.kind === 'text' && chunk.text.trim() !== '') {
        stopMusing()
        show($, 'talking')
      } else if (chunk.kind === 'tool') {
        stopMusing()

        // What a command is about shows only in its arguments: the scene
        // waits for the call, rather than passing through a generic one.
        if (!isShell(chunk.name)) {
          show($, activityOf(chunk.name))
        }
      }

      yield chunk
    }
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) {
      return next(e)
    }

    const args = e as unknown as Readonly<Record<string, unknown>>
    const activity = activityOf(e.tool, args)
    const detail = detailOf(e.tool, args)
    let hasFailed = false
    running += 1
    stopMusing()
    show($, activity, detail, HOLD_MS)

    try {
      const ran = await next(e)
      hasFailed = ran.deny === undefined && ran.isError === true

      return ran
    } finally {
      running = Math.max(0, running - 1)

      if (hasFailed) {
        show($, 'error', detail, ERROR_HOLD_MS)
      } else if (isAsking) {
        show($, activity, detail)
      }

      isAsking = false

      if (running === 0 && isWorking) {
        museLater($)
      }
    }
  })

  // The dialog is on screen from here until the person answers; nothing says
  // when they did, so the scene stays until the call itself returns.
  on('classic.PermissionRequest', ($, e, next) => {
    isAsking = true
    show($, 'permission', e.tool_name)

    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    if (e.agentId !== undefined || e.trigger === 'precompute') {
      return next(e)
    }

    show($, 'compacting', '', HOLD_MS)

    try {
      return await next(e)
    } finally {
      show($, isWorking ? 'thinking' : 'idle')
    }
  })

  on('turn.complete', ($, e, next) => {
    if (e.agentId !== undefined) {
      return next(e)
    }

    stopTimers()
    isWorking = false
    running = 0
    show($, e.isAborted ? 'idle' : 'done')

    if (!e.isAborted) {
      rest = $.clock.after(REST_AFTER_MS, () => {
        if (!isWorking) {
          show($, 'idle')
        }
      })
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

    if (e.surface === 'terminal') {
      return terminalTree($.ui.resolve(e), shown, await read($, frame), gauged, detailed)
    }

    if (e.surface === 'desktop') {
      return desktopTree($.ui.resolve(e), shown, gauged, detailed)
    }

    return next(e)
  })
}
