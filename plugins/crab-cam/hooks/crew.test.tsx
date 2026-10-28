import { expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { AgentInfo, On } from 'claude-code'

import {
  CREW_COLOURS,
  NO_CREW,
  SAMPLE_TURN_MS,
  colourOf,
  elapsed,
  finish,
  join,
  modelName,
  sampleCrew,
  tokensText,
  workflowNameOf,
} from './crew'
import { CREW_GLYPH, crabSvg, crewSvg, resumed } from './scenes'

const PANE = {
  plugin: 'crab-cam',
  component: 'Pane',
  requestId: 'crab-crew',
  props: {
    title: 'Crab crew',
    isFocused: false,
    bodyColumns: 90,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const BAND = {
  plugin: 'crab-cam',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: true, maxRows: 8, bodyColumns: 120, scroll: { offset: 0, bodyRows: 8 }, view: {} },
} as const

const ENGINE = { plugin: 'engine', tier: 'core' } as const
const USAGE = { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 10000, cache_creation_input_tokens: 0 }

// What the engine answers beneath the mod: the agents it lists, the panes it
// opened for the mod, and a record of each open and close.
function session(on: On, listed: AgentInfo[] = []): { clock: MockClock; opens: string[]; closes: string[]; open: Set<string> } {
  const opens: string[] = []
  const closes: string[] = []
  const open = new Set<string>()
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  on('classic.Stop', () => ({}))
  on('classic.SubagentStart', () => ({}))
  on('agent.list', () => ({ value: listed }))
  on('ui.panes', () => ({
    value: [...open].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })),
  }))
  on('ui.open', (_, e) => {
    opens.push(e.id)
    open.add(e.id)

    return { value: { isPlaced: true } }
  })
  on('ui.close', (_, e) => {
    closes.push(e.id)
    open.delete(e.id)

    return { value: undefined }
  })
  on('tool.call', { tool: 'Read' }, () => ({ result: 'ok' }))
  on('tool.call', { tool: 'Workflow' }, () => ({ result: 'started' }))
  on('turn.step', async function* (_, e) {
    const usage = { ...USAGE, model: e.model }

    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage }
  })

  return { clock: mock.clock(on), opens, closes, open }
}

// The mod's command, typed in the composer.
const command = ($: Engine, args: string) =>
  $.command.run({ command: 'crab-cam', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })

const running = (id: string, description: string, type: string): AgentInfo => ({ id, description, type, status: 'running' })

async function spawn($: Engine, description: string, subagentType: string): Promise<void> {
  await $.agent.spawn({
    tool_use_id: `call-${description}`,
    prompt: 'x',
    description,
    subagentType,
    provider: ENGINE,
    parentModel: 'claude-opus-5-5',
    background: false,
    fork: false,
  })
}

async function stepOf($: Engine, agentId: string, model: string): Promise<void> {
  for await (const _ of $.turn.step({ turnId: agentId, index: 0, model, messageCount: 1, agentId })) {
    // Nothing streams; the step's usage is what counts.
  }
}

async function helperEnds($: Engine, agentId: string): Promise<void> {
  await $.turn.complete({ answer: 'Found it.', durationMs: 1, isAborted: false, turnId: agentId, reason: 'answer', agentId })
}

// What the pane shows now on a surface, as the texts of its elements.
async function paneTexts($: Engine, surface: 'desktop' | 'terminal' = 'desktop'): Promise<string[]> {
  const ui = await $.ui.mount({ ...PANE, surface })
  const texts = [...(await ui.findAll({ type: 'Text' })), ...(await ui.findAll({ type: 'Button' }))].map(found => found.text)
  await ui.unmount()

  return texts
}

test('a new round clears the cards of the last, and seats start over', () => {
  const first = join(NO_CREW, 'a', 0, []).crew
  const two = join(first, 'b', 10, []).crew
  expect(two.members.map(member => member.seat)).toEqual([0, 1])

  const through = { ...two, members: two.members.map(member => finish(member, false, 20)) }
  const next = join(through, 'c', 30, ['review-changes'])
  expect(next.isNewRound).toBe(true)
  expect(next.crew.members.map(member => member.id)).toEqual(['c'])
  expect(next.crew.workflows).toEqual(['review-changes'])
  expect(next.crew.members[0]?.seat).toBe(0)
})

test("the colours go round after the sixth helper, and none is Claude's orange", () => {
  let crew = NO_CREW

  for (const id of ['1', '2', '3', '4', '5', '6', '7']) {
    crew = join(crew, id, 0, []).crew
  }

  expect(crew.members.map(colourOf)).toEqual([...CREW_COLOURS, CREW_COLOURS[0]])
  expect(CREW_COLOURS).not.toContain('#D97757')
})

test('times, tokens and workflow names read as the pane shows them', () => {
  expect(elapsed(9_000)).toBe('0:09')
  expect(elapsed(125_000)).toBe('2:05')
  expect(elapsed(3_725_000)).toBe('1:02:05')
  expect(tokensText(950)).toBe('950 tokens')
  expect(tokensText(11_200)).toBe('11.2k tokens')
  expect(tokensText(2_000_000)).toBe('2M tokens')
  expect(workflowNameOf({ name: 'audit' })).toBe('audit')
  expect(workflowNameOf({ script: "export const meta = {\n  name: 'review-changes',\n  description: 'x' }" })).toBe('review-changes')
  expect(workflowNameOf({ script: 'agent("x")' })).toBeUndefined()
  expect(modelName('claude-haiku-5-5')).toBe('Haiku 5.5')
  expect(modelName('claude-opus-4-1-20250805')).toBe('Opus 4.1')
  expect(modelName('claude-sonnet-5[1m]')).toBe('Sonnet 5')
  expect(modelName('gpt-5')).toBe('gpt-5')
})

test("the demo's crew moves on one helper at a time at most, and two of them finish", () => {
  const at = (turn: number) =>
    sampleCrew(0, turn * SAMPLE_TURN_MS).members.map(member => `${member.phase} ${member.steps.length}`)

  for (let turn = 1; turn < 24; turn += 1) {
    const [before, after] = [at(turn - 1), at(turn)]
    // A turn of one that is through already passes without a change.
    expect(after.filter((card, seat) => card !== before[seat]).length).toBeLessThanOrEqual(1)
  }

  expect(at(23).filter(card => card.startsWith('done'))).toHaveLength(2)
})

test('the band shows three of the crew at most, then how many more; one through stands still with a tick', () => {
  const crabs = CREW_COLOURS.map((colour, seat) => ({ colour, phase: seat === 0 ? ('done' as const) : ('working' as const) }))
  const { svg, width } = crewSvg({ since: 0, crabs: [...crabs, { colour: CREW_COLOURS[0], phase: 'failed' }] })

  expect(svg).toContain('>+4<')
  expect(width).toBe(3 * 30 + 24)
  expect(svg.match(/#2DA44E/g)).toHaveLength(1)
  // Two of the three shown are at work and bob; the one through does not.
  expect(svg.match(/<animateTransform/g)).toHaveLength(2)
})

test('a drawing drawn afresh goes on where it was rather than starting over', () => {
  const drawing = '<svg><animate dur="1s"/><animate dur="1s" begin="0.25s"/><animateTransform dur="1s" fill="freeze"></animateTransform></svg>'
  expect(resumed(drawing, 12.5)).toBe(
    '<svg><animate dur="1s" begin="-12.5s"/><animate dur="1s" begin="-12.25s"/><animateTransform dur="1s" fill="freeze" begin="-12.5s"></animateTransform></svg>',
  )

  // Every animation of a real crab is moved back, none is left to start at 0.
  const crab = resumed(crabSvg('coding', '#1D9E75'), 3)
  expect(crab.match(/<animate/g)?.length).toBe(crab.match(/begin="-/g)?.length)
})

test('a subagent gets a card with its task, its time beside it, and its type, model and tokens under it', async ($, on) => {
  const { clock } = session(on, [running('h1', 'Review the diff', 'Explore')])
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'h1' }))

  await $.turn.start({ text: 'review it', turnId: 't1' })
  await spawn($, 'Review the diff', 'Explore')
  await $.tool.call({ tool: 'Read', tool_use_id: 'r', file_path: '/repo/a.ts', agentId: 'h1' })
  await stepOf($, 'h1', 'claude-haiku-5-5')
  await clock.advance(5000)

  for (const surface of ['desktop', 'terminal'] as const) {
    const texts = await paneTexts($, surface)
    expect(texts).toContain('Review the diff')
    expect(texts).toContain('Reading')
    expect(texts).toContain('· a.ts')
    expect(texts).toContain('⌄ Subagents')
    expect(texts).toContain('1 of 1 running')
    expect(texts).toContain('› Steps (1)')
  }

  // Its time stands at the title's right, dim while it works. The
  // desktop puts its type, model and tokens on pills of their own; the
  // terminal has no fills, and puts them on a line of their own.
  const drawn = await paneTexts($)
  expect(drawn).toContain('0:05')
  expect(drawn).toContain('Explore')
  expect(drawn).toContain('Haiku 5.5')
  expect(drawn).toContain('11.2k tokens')
  const glyphs = await paneTexts($, 'terminal')
  expect(glyphs).toContain('0:05')
  expect(glyphs).toContain('Explore · Haiku 5.5 · 11.2k tokens')

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'steps-h1' })
  await ui.unmount()
  expect(await paneTexts($)).toContain('› Read · a.ts')

  await helperEnds($, 'h1')
  await clock.advance(5000)
  const after = await paneTexts($)
  expect(after).toContain('✓ 0:05')
  expect(after).toContain('Done')
  expect(after).toContain('0 of 1 running')
})

test('the pane stays closed as a round starts', async ($, on) => {
  const { clock, opens } = session(on, [running('h1', 'Review the diff', 'Explore')])
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'h1' }))

  await $.turn.start({ text: 'review it', turnId: 't1' })
  await spawn($, 'Review the diff', 'Explore')
  await clock.advance(0)
  expect(opens).toEqual([])
})

test('while a crew works, the band offers to watch it until the pane is open', async ($, on) => {
  const { clock, opens } = session(on, [running('h1', 'Review the diff', 'Explore')])
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'h1' }))
  const watch = async (surface: 'desktop' | 'terminal') => {
    const band = await $.ui.mount({ ...BAND, surface })
    const button = await band.find({ type: 'Button', key: 'watch-crew' })
    await band.unmount()

    return button
  }

  await $.turn.start({ text: 'review it', turnId: 't1' })
  expect(await watch('desktop')).toBeUndefined()

  await spawn($, 'Review the diff', 'Explore')
  await clock.advance(0)

  for (const surface of ['desktop', 'terminal'] as const) {
    expect((await watch(surface))?.text).toBe('Watch crew ↗')
  }

  // Beside the button stands the crew: a glyph crab in its colour on the terminal.
  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await terminal.findAll({ type: 'Text' })).map(found => found.text)).toContain(CREW_GLYPH)
  await terminal.unmount()

  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await band.press({ key: 'watch-crew' })
  await band.unmount()
  expect(opens).toEqual(['crab-crew'])
  expect(await watch('desktop')).toBeUndefined()

  // Closed again, the pane can be watched again, until the crew is through.
  await command($, 'crew')
  expect((await watch('desktop'))?.text).toBe('Watch crew ↗')

  await helperEnds($, 'h1')
  await clock.advance(0)
  expect(await watch('desktop')).toBeUndefined()
})

test("the band is drawn again on the crew's every tick, its drawings as far in as they have run", async ($, on) => {
  const { clock } = session(on, [running('h1', 'Review the diff', 'Explore')])
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'h1' }))

  await $.turn.start({ text: 'review it', turnId: 't1' })
  await spawn($, 'Review the diff', 'Explore')
  await clock.advance(0)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const crabAt = async () => String((await band.find({ type: 'Svg', alt: 'The Claude crab' }))?.props.source)
  const before = await crabAt()
  await clock.advance(2000)
  expect(await crabAt()).not.toBe(before)
  await band.unmount()
})

test("a workflow's agents share a group headed by its name, each by type and number", async ($, on) => {
  const { clock } = session(on)

  await $.turn.start({ text: 'audit it', turnId: 't1' })
  const script = "export const meta = { name: 'review-changes', description: 'x' }"
  await $.tool.call({ tool: 'Workflow', tool_use_id: 'w', script })
  await $.classic.SubagentStart({ agent_id: 'w1', agent_type: 'Explore' })
  await $.classic.SubagentStart({ agent_id: 'w2', agent_type: 'Explore' })
  await clock.advance(0)

  const texts = await paneTexts($, 'terminal')
  expect(texts).toContain('⌄ Workflow · review-changes')
  expect(texts).toContain('2 of 2 running')
  expect(texts).toContain('Explore 1')
  expect(texts).toContain('Explore 2')
  // Their titles name the type already, so it gets no pill.
  expect(texts).toContain('0:00')
  expect(texts).not.toContain('Explore')

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'group-workflow' })
  await ui.unmount()
  const folded = await paneTexts($, 'terminal')
  expect(folded).toContain('› Workflow · review-changes')
  expect(folded).not.toContain('Explore 1')
})

test('crew opens the pane and closes it again', async ($, on) => {
  const { opens, closes } = session(on)
  const crew = () => command($, 'crew')

  await crew()
  expect(opens).toEqual(['crab-crew'])
  expect(await paneTexts($)).toContain('No crew yet. A card shows up here for every subagent Claude puts to work.')

  await crew()
  expect(closes).toEqual(['crab-crew'])
})

test('the demo brings on a sample crew near its end, which opens the pane, and closes it after', async ($, on) => {
  const { clock, closes, opens } = session(on)

  await command($, 'demo')
  await clock.advance(60_000)
  expect(opens).toEqual([])

  // The crew comes on after every other scene's three seconds but done's.
  await clock.advance(12_000)
  expect(opens).toEqual(['crab-crew'])
  const texts = await paneTexts($)
  expect(texts).toContain('Review the diff')
  expect(texts).toContain('⌄ Workflow · review-changes')
  expect(texts).toContain('3 of 3 running')

  await clock.advance(120_000)
  expect(closes).toEqual(['crab-crew'])
  expect(await paneTexts($)).toContain('No crew yet. A card shows up here for every subagent Claude puts to work.')
})

test("a demo started again during its crew takes that crew off, and closes the pane it opened", async ($, on) => {
  const { clock, closes } = session(on)

  await command($, 'demo')
  await clock.advance(72_000)
  expect(await paneTexts($)).toContain('Review the diff')

  await command($, 'demo')
  await clock.advance(0)
  expect(closes).toEqual(['crab-crew'])
  expect(await paneTexts($)).toContain('No crew yet. A card shows up here for every subagent Claude puts to work.')
})

test('a helper whose end is never heard is through once the engine lists it so, and the next helper starts a new round', async ($, on) => {
  const listed = [running('h1', 'Review the diff', 'Explore')]
  const { clock } = session(on, listed)
  let next = 'h1'
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: next }))

  await $.turn.start({ text: 'review it', turnId: 't1' })
  await spawn($, 'Review the diff', 'Explore')
  await clock.advance(0)

  listed[0] = { ...running('h1', 'Review the diff', 'Explore'), status: 'completed' }
  await $.classic.Stop({ stop_hook_active: false, background_tasks: [] })
  await clock.advance(0)
  expect(await paneTexts($)).toContain('Done')

  next = 'h2'
  listed.push(running('h2', 'Fix the test', 'general-purpose'))
  await $.turn.start({ text: 'fix it', turnId: 't2' })
  await spawn($, 'Fix the test', 'general-purpose')
  await clock.advance(0)
  const texts = await paneTexts($)
  expect(texts).toContain('Fix the test')
  expect(texts).not.toContain('Review the diff')
})

test("a fork is no one's crew, and does not keep the last round's cards", async ($, on) => {
  const listed = [running('h1', 'Review the diff', 'Explore')]
  const { clock } = session(on, listed)
  let next = 'h1'
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: next }))

  await $.turn.start({ text: 'review it', turnId: 't1' })
  await spawn($, 'Review the diff', 'Explore')
  // A fork: the engine does not list it, and it has no type.
  await $.classic.SubagentStart({ agent_id: 'f1', agent_type: '' })
  await clock.advance(0)
  await helperEnds($, 'h1')
  await clock.advance(0)

  next = 'h2'
  listed.push(running('h2', 'Fix the test', 'general-purpose'))
  await spawn($, 'Fix the test', 'general-purpose')
  await clock.advance(0)
  const texts = await paneTexts($)
  expect(texts).toContain('Fix the test')
  expect(texts).not.toContain('Review the diff')
  expect(texts).toContain('1 of 1 running')
})

test('what a helper does after its end changes nothing of its card', async ($, on) => {
  const { clock } = session(on, [running('h1', 'Review the diff', 'Explore')])
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'h1' }))

  await $.turn.start({ text: 'review it', turnId: 't1' })
  await spawn($, 'Review the diff', 'Explore')
  await $.tool.call({ tool: 'Read', tool_use_id: 'r1', file_path: '/repo/a.ts', agentId: 'h1' })
  await helperEnds($, 'h1')
  await $.tool.call({ tool: 'Read', tool_use_id: 'r2', file_path: '/repo/b.ts', agentId: 'h1' })
  await clock.advance(5000)

  const texts = await paneTexts($)
  expect(texts).toContain('Done')
  expect(texts).toContain('› Steps (1)')
  expect(texts).toContain('0 of 1 running')
})

test("a workflow's agents that run one after another stay one round under its name", async ($, on) => {
  const { clock } = session(on)

  await $.turn.start({ text: 'audit it', turnId: 't1' })
  const script = "export const meta = { name: 'review-changes', description: 'x' }"
  await $.tool.call({ tool: 'Workflow', tool_use_id: 'w', script })
  await $.classic.SubagentStart({ agent_id: 'w1', agent_type: 'Explore' })
  await clock.advance(0)
  await helperEnds($, 'w1')
  // The turn stops in between, with the workflow still running.
  await $.classic.Stop({
    stop_hook_active: false,
    background_tasks: [{ id: 'b1', type: 'workflow', status: 'running', description: 'review', name: 'review-changes' }],
  })
  await clock.advance(0)
  await $.classic.SubagentStart({ agent_id: 'w2', agent_type: 'Explore' })
  await clock.advance(0)

  const texts = await paneTexts($, 'terminal')
  expect(texts).toContain('⌄ Workflow · review-changes')
  expect(texts).toContain('1 of 2 running')
  expect(texts).toContain('Explore 1')
  expect(texts).toContain('Explore 2')
})

test('a helper that ends without an answer shows it stopped before it finished', async ($, on) => {
  const { clock } = session(on, [running('h1', 'Review the diff', 'Explore')])
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'h1' }))

  await $.turn.start({ text: 'review it', turnId: 't1' })
  await spawn($, 'Review the diff', 'Explore')
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 'h1', reason: 'answer', agentId: 'h1' })
  await clock.advance(0)

  const texts = await paneTexts($)
  expect(texts).toContain('Stopped before it finished')
  expect(texts.some(text => text.startsWith('✕ '))).toBe(true)
  expect(texts).toContain('0 of 1 running')
})

test("a workflow's agents spawned under labels go by them, in the workflow's group", async ($, on) => {
  const { clock } = session(on)
  on('agent.spawn', (_, e) => ({ model: 'claude-opus-5-5', agentId: e.description === 'meter colours' ? 'w1' : 'w2' }))

  await $.turn.start({ text: 'check it', turnId: 't1' })
  const script = "export const meta = { name: 'crew-check', description: 'x' }"
  await $.tool.call({ tool: 'Workflow', tool_use_id: 'w', script })
  await spawn($, 'meter colours', 'Explore')
  await clock.advance(0)
  await helperEnds($, 'w1')
  await spawn($, 'demo assets', 'Explore')
  await clock.advance(0)

  const texts = await paneTexts($)
  expect(texts).toContain('⌄ Workflow · crew-check')
  expect(texts).not.toContain('⌄ Subagents')
  expect(texts).toContain('meter colours')
  expect(texts).toContain('demo assets')
  expect(texts).toContain('Explore')
  expect(texts).toContain('0:00')
  expect(texts).toContain('1 of 2 running')
})

test('a workflow run again under the same name starts a round of its own', async ($, on) => {
  const { clock } = session(on)
  let next = 'w1'
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: next }))
  const script = "export const meta = { name: 'crew-check', description: 'x' }"

  await $.turn.start({ text: 'check it', turnId: 't1' })
  await $.tool.call({ tool: 'Workflow', tool_use_id: 'w', script })
  await spawn($, 'meter colours', 'Explore')
  await helperEnds($, 'w1')
  await $.classic.Stop({ stop_hook_active: false, background_tasks: [] })
  await clock.advance(0)

  next = 'w2'
  await $.turn.start({ text: 'again', turnId: 't2' })
  await $.tool.call({ tool: 'Workflow', tool_use_id: 'w-again', script })
  await spawn($, 'demo assets', 'Explore')
  await clock.advance(0)

  const texts = await paneTexts($)
  expect(texts).toContain('demo assets')
  expect(texts).not.toContain('meter colours')
  expect(texts).toContain('1 of 1 running')
})

test('a workflow called by its saved script keeps its round, and takes its name from the stop', async ($, on) => {
  const { clock } = session(on)
  let next = 'w0'
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: next }))
  const script = "export const meta = { name: 'crew-check', description: 'x' }"

  // A round from before, of a run with the same name.
  await $.turn.start({ text: 'check it', turnId: 't1' })
  await $.tool.call({ tool: 'Workflow', tool_use_id: 'w', script })
  await spawn($, 'state keys', 'Explore')
  await helperEnds($, 'w0')
  await $.classic.Stop({ stop_hook_active: false, background_tasks: [] })
  await clock.advance(0)

  next = 'w1'
  await $.turn.start({ text: 'again', turnId: 't2' })
  await $.tool.call({ tool: 'Workflow', tool_use_id: 'w-again', scriptPath: '/scripts/crew-check.js' })
  await spawn($, 'meter colours', 'Explore')
  await clock.advance(0)
  expect(await paneTexts($)).not.toContain('state keys')

  await helperEnds($, 'w1')
  await $.classic.Stop({
    stop_hook_active: false,
    background_tasks: [{ id: 'b1', type: 'workflow', status: 'running', description: 'crew-check', name: 'crew-check' }],
  })
  next = 'w2'
  await spawn($, 'demo assets', 'Explore')
  await clock.advance(0)

  const texts = await paneTexts($)
  expect(texts).toContain('⌄ Workflow · crew-check')
  expect(texts).toContain('meter colours')
  expect(texts).toContain('demo assets')
  expect(texts).toContain('1 of 2 running')
})

test('the terminal band draws three of the crew in their colours, with a tick or a mark, then how many more', async ($, on) => {
  const ids = ['h1', 'h2', 'h3', 'h4', 'h5']
  const { clock } = session(
    on,
    ids.map(id => running(id, `Task ${id}`, 'Explore')),
  )
  let next = 'h1'
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: next }))

  await $.turn.start({ text: 'fan out', turnId: 't1' })

  for (const id of ids) {
    next = id
    await spawn($, `Task ${id}`, 'Explore')
  }

  await helperEnds($, 'h1')
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 'h2', reason: 'answer', agentId: 'h2' })
  await clock.advance(0)

  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const texts = await band.findAll({ type: 'Text' })
  await band.unmount()
  const glyphs = texts.filter(found => found.text === CREW_GLYPH)
  expect(glyphs.map(found => found.props.color)).toEqual([CREW_COLOURS[0], CREW_COLOURS[1], CREW_COLOURS[2]])
  expect(texts.find(found => found.text === '✓')?.props.color).toBe('success')
  expect(texts.find(found => found.text === '!')?.props.color).toBe('error')
  expect(texts.map(found => found.text)).toContain('+2')
})
