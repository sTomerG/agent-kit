import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'crab-cam',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 120, scroll: { offset: 0, bodyRows: 8 }, view: {} },
} as const

test('the band draws on the terminal and on the desktop', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })

    expect(await ui.find({ type: 'Text', text: /Claude is resting/ })).toBeDefined()
    await ui.unmount()
  }
})

test('details spell the readings out beside the meter on both surfaces', async ($, on) => {
  on('session.measure', () => ({ changed: [] }))
  await $.command.run({
    command: 'crab-cam',
    args: 'details',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })
  await $.session.measure({
    changed: [],
    context: { tokens: 62000, window: 100000, percent: 62 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 57, resetsAt: '2026-10-04T12:00:00Z' },
      { kind: 'seven_day', percentUsed: 41, resetsAt: '2026-10-04T12:00:00Z' },
    ],
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })

    expect(await ui.find({ type: 'Text', text: /Context window/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /57% used/ })).toBeDefined()
    await ui.unmount()
  }
})
