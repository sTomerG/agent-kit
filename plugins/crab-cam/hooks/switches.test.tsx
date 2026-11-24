import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const BAND = {
  plugin: 'crab-cam',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 120, scroll: { offset: 0, bodyRows: 8 }, view: {} },
  surface: 'desktop',
} as const
const START = { cwd: '/work', surface: 'desktop', isInteractive: true } as const

// What the engine answers beneath the mod, with the plugin's store in memory,
// so a test can seed the store and read what the mod kept.
function store(on: On, entries: Record<string, unknown> = {}): Record<string, unknown> {
  on('store.get', (_, e) => ({ value: entries[e.key] }))
  on('store.set', (_, e) => {
    entries[e.key] = e.value

    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.measure', () => ({ changed: [] }))

  return entries
}

async function crabCam($: Engine, args: string): Promise<void> {
  await $.command.run({
    command: 'crab-cam',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })
}

async function measure($: Engine): Promise<void> {
  await $.session.measure({
    changed: [],
    context: { tokens: 62000, window: 100000, percent: 62 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 57, resetsAt: '2026-10-04T12:00:00Z' },
      { kind: 'seven_day', percentUsed: 41, resetsAt: '2026-10-04T12:00:00Z' },
    ],
  })
}

// Whether the band says this now.
async function says($: Engine, text: RegExp): Promise<boolean> {
  const ui = await $.ui.mount(BAND)
  const found = await ui.find({ type: 'Text', text })
  await ui.unmount()

  return found !== undefined
}

test('each switch /crab-cam sets is kept for the next session', async ($, on) => {
  const kept = store(on)

  await crabCam($, 'details')
  await crabCam($, 'commands')
  await crabCam($, 'meter')
  await crabCam($, '')
  expect(kept).toEqual({ isDetailed: true, isMetered: false, isRaw: true, isHidden: true })

  await crabCam($, 'details')
  expect(kept.isDetailed).toBe(false)
})

test('details turn the meter on, and both are kept', async ($, on) => {
  const kept = store(on)

  await crabCam($, 'meter')
  await crabCam($, 'details')
  expect(kept).toEqual({ isMetered: true, isDetailed: true })
})

test('a new session starts with the switches an earlier session kept', async ($, on) => {
  store(on, { isDetailed: true })

  await $.session.start(START)
  await measure($)
  expect(await says($, /Context window/)).toBe(true)
})

test('a new session with nothing kept starts without the readings', async ($, on) => {
  store(on)

  await $.session.start(START)
  await measure($)
  expect(await says($, /Context window/)).toBe(false)
})

test('a reload keeps what this session set, whatever another session kept since', async ($, on) => {
  const kept = store(on)

  await crabCam($, 'details')
  kept.isDetailed = false
  await $.session.start(START)
  await measure($)
  expect(await says($, /Context window/)).toBe(true)
})

test('a kept value that is not true or false is passed by', async ($, on) => {
  store(on, { isHidden: 'yes', isDetailed: 1 })

  await $.session.start(START)
  await measure($)
  expect(await says($, /Claude is resting/)).toBe(true)
  expect(await says($, /Context window/)).toBe(false)
})
