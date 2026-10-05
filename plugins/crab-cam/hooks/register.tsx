import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, Timer } from 'claude-code'

import type { Activity, Meter, Scene } from '../types'
import type { Lingering } from './activity'
import { activityOf, activityOfStreaming, isToldByArgs, opensDesign, sceneOfLingering, whole } from './activity'
import { meterAlt, meterLines, meterRow, meterSvg, meterWidth } from './meter'
import { CRAB_WIDTH, PROP_WIDTH, SCENE_HEIGHT, crabSvg, propSvg, sceneRows } from './scenes'

const COMMAND = 'crab-cam'
const REST_AFTER_MS = 8000
const TICK_MS = 600
// The detail may run on to a second line: the layout cuts whatever is wider
// than the room before the shell, so the limit only keeps it to two lines.
const DETAIL_LENGTH = 140
// A detail up to this long is taken to fit on one line.
const ONE_LINE = 60
const DETAIL_ROWS = 2
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

// A command comes with a description of what it does in plain words, the one
// the app shows too: that goes before the command itself.
const DETAIL_KEYS = ['file_path', 'notebook_path', 'description', 'command', 'pattern', 'query', 'url', 'skill'] as const
// The same with the command itself first, for who wants to see what runs.
const RAW_KEYS = ['file_path', 'notebook_path', 'command', 'pattern', 'query', 'url', 'description', 'skill'] as const

// What the call is about, in a few words: the file's name, what the command
// does, the pattern.
function detailOf(tool: string, args: Readonly<Record<string, unknown>>, raw = false): string {
  for (const key of raw ? RAW_KEYS : DETAIL_KEYS) {
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
// Whether this turn has taken up design work, by a design skill or tool or
// the start of an artifact: a page written after that is designed, not coded.
let isDesigning = false
// The main loop's calls still running, by tool_use_id, in the order begun.
const calls = new Map<string, Call>()
let pending: Promise<unknown> = Promise.resolve()
let rest: Timer | undefined
let ticker: Timer | undefined
let demo: Timer | undefined
let muse: Timer | undefined
// The tool a permission dialog is open for, while one is.
let asking: string | undefined
// What the last stop of the main loop left running in the background.
let lingering: readonly Lingering[] = []
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

// Drops the hold on the scene on screen and what is queued behind it, so the
// next scene shows at once and nothing from before it shows after.
function flush(): void {
  busy?.cancel()
  busy = undefined
  held = []
  trailing = undefined
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

    if (isWorking && calls.size === 0) {
      show($, 'thinking')
    }
  })
}

function stopTicking(): void {
  ticker?.cancel()
  ticker = undefined
}

// The scene between turns: the background work still going, or rest.
function settle($: EngineInterface): void {
  const scene = sceneOfLingering(lingering)

  if (scene === undefined) {
    stopTicking()
    show($, 'idle')
  } else {
    show($, scene.activity, scene.detail.length > DETAIL_LENGTH ? `${scene.detail.slice(0, DETAIL_LENGTH - 1)}…` : scene.detail)
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

function stopTimers(): void {
  stopMusing()
  rest?.cancel()
  rest = undefined
}

// Walks every scene in turn, so each animation can be seen without a task
// that happens to raise it; the session's own scenes wait until it is through.
function playDemo($: EngineInterface): void {
  demo?.cancel()
  flush()
  let index = 0
  paint($, DEMO[0] ?? 'idle', DEMO_DETAIL)

  demo = $.clock.every(DEMO_MS, () => {
    index += 1
    const activity = DEMO[index]

    if (activity === undefined) {
      demo?.cancel()
      demo = undefined
      restore($)

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
      <Box flexDirection="column" alignItems="flex-end" flexShrink={0}>
        {lines.map(line => (
          <Text bold>{line.value}</Text>
        ))}
      </Box>
    </Box>
  )
}

// The line under the label: on one line and cut at the edge, or for a long
// one wrapped over two rows and cut below them.
function detailLine(table: Elements['terminal'] | Elements['desktop'], detail: string) {
  const { Box, Text } = table

  if (detail.length <= ONE_LINE) {
    return (
      <Text dimColor wrap="truncate-end">
        {detail === '' ? ' ' : detail}
      </Text>
    )
  }

  return (
    <Box height={DETAIL_ROWS} overflow="hidden">
      <Text dimColor wrap="wrap">
        {detail}
      </Text>
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
        {detail.length <= ONE_LINE && <Text> </Text>}
        <Text bold wrap="truncate-end">
          {LABELS[activity]}
        </Text>
        {detailLine(table, detail)}
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
      <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
        <Text bold>{label}</Text>
        {detail !== '' && detailLine(table, detail)}
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
        'Hide or show the crab; "demo" plays every scene, "meter" shows or hides the shell, "details" its readings in figures, "commands" shows commands as typed',
      argumentHint: '[demo|meter|details|commands]',
    })

    // A reload in the middle of a turn finds the turn's scene in place and
    // leaves it; only a scene that was on its way to rest is put to rest.
    const stored = await read($, scene)

    if (stored.activity === 'done' || stored.activity === 'error') {
      show($, 'idle')
    }

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

    // Only the terminal's glyph scenes are animated by a tick; the desktop's
    // drawing animates itself.
    if (ticker === undefined && (await $.session.surfaces()).includes('terminal')) {
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
    if (e.agentId !== undefined) {
      return next(e)
    }

    const args = e as unknown as Readonly<Record<string, unknown>>
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

    show($, 'compacting', '', HOLD_MS)

    try {
      return await next(e)
    } finally {
      restore($)
    }
  })

  on('turn.complete', ($, e, next) => {
    if (e.agentId !== undefined) {
      return next(e)
    }

    stopTimers()
    isWorking = false
    calls.clear()
    asking = undefined
    // Nothing of the turn shows once it is over.
    flush()

    if (e.isAborted) {
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
    flush()
    isWorking = false
    isDesigning = false
    calls.clear()
    asking = undefined
    lingering = []
    paint($, 'idle', '')

    return next(e)
  })

  // The turn may be over while a command or a helper it started runs on: the
  // crab then keeps at it rather than resting, until the next turn begins.
  on('classic.Stop', ($, e, next) => {
    lingering = e.background_tasks ?? []

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

    if (e.surface === 'terminal') {
      return terminalTree($.ui.resolve(e), shown, await read($, frame), gauged, detailed)
    }

    if (e.surface === 'desktop') {
      return desktopTree($.ui.resolve(e), shown, gauged, detailed)
    }

    return next(e)
  })
}
