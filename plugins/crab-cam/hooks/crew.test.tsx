import { expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { AgentInfo, On } from 'claude-code'

import { CREW_COLOURS, NO_CREW, colourOf, elapsed, finish, join, tokensText, workflowNameOf } from './crew'

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

test('the colours go round after the seventh helper', () => {
  let crew = NO_CREW

  for (const id of ['1', '2', '3', '4', '5', '6', '7', '8']) {
    crew = join(crew, id, 0, []).crew
  }

  expect(crew.members.map(colourOf)).toEqual([...CREW_COLOURS, CREW_COLOURS[0]])
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
})

test('a subagent gets a card with its task, type, model, tokens and steps', async ($, on) => {
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
    expect(texts).toContain('Explore · 0:05')
    expect(texts).toContain(' haiku-5-5 ')
    expect(texts).toContain(' 11.2k tokens ')
    expect(texts).toContain('reading · a.ts')
    expect(texts).toContain('▾ Subagents · 1 of 1 running')
    expect(texts).toContain('▸ 1 step')
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'steps-h1' })
  await ui.unmount()
  expect(await paneTexts($)).toContain('  reading · a.ts')

  await helperEnds($, 'h1')
  await clock.advance(5000)
  const after = await paneTexts($)
  expect(after).toContain('done')
  expect(after).toContain('Explore · 0:05')
  expect(after).toContain('▾ Subagents · 0 of 1 running')
})

test('the pane opens by itself as a round starts, until crew auto turns that off', async ($, on) => {
  const listed = [running('h1', 'Review the diff', 'Explore'), running('h2', 'Fix the test', 'general-purpose')]
  const { clock, opens } = session(on, listed)
  let next = 'h1'
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: next }))

  await $.turn.start({ text: 'review it', turnId: 't1' })
  await spawn($, 'Review the diff', 'Explore')
  await clock.advance(0)
  expect(opens).toEqual(['crab-crew'])

  await helperEnds($, 'h1')
  await command($, 'crew auto')
  next = 'h2'
  await spawn($, 'Fix the test', 'general-purpose')
  await clock.advance(0)
  expect(opens).toEqual(['crab-crew'])

  const texts = await paneTexts($)
  expect(texts).toContain('Fix the test')
  expect(texts).not.toContain('Review the diff')
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
  expect(texts).toContain('▾ review-changes · 2 of 2 running')
  expect(texts).toContain('Explore 1')
  expect(texts).toContain('Explore 2')

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'group-workflow' })
  await ui.unmount()
  const folded = await paneTexts($, 'terminal')
  expect(folded).toContain('▸ review-changes · 2 of 2 running')
  expect(folded).not.toContain('Explore 1')
})

test('crew opens the pane and closes it again', async ($, on) => {
  const { opens, closes } = session(on)
  const crew = () => command($, 'crew')

  await crew()
  expect(opens).toEqual(['crab-crew'])
  expect(await paneTexts($)).toContain('No crew yet. A card shows up here for every helper Claude puts to work.')

  await crew()
  expect(closes).toEqual(['crab-crew'])
})

test('the demo fills the pane with a sample crew, and closes the pane after', async ($, on) => {
  const { clock, closes } = session(on)

  await command($, 'demo')
  const texts = await paneTexts($)
  expect(texts).toContain('Review the diff')
  expect(texts).toContain('▾ review-changes · 3 of 3 running')

  await clock.advance(120_000)
  expect(closes).toEqual(['crab-crew'])
  expect(await paneTexts($)).toContain('No crew yet. A card shows up here for every helper Claude puts to work.')
})
