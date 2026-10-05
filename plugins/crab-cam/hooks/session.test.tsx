import { expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { On } from 'claude-code'

const BAND = {
  plugin: 'crab-cam',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 120, scroll: { offset: 0, bodyRows: 8 }, view: {} },
  surface: 'desktop',
} as const
const STOP = { stop_hook_active: false } as const

// What the engine answers beneath the mod in a session with nothing else in it.
function session(on: On): MockClock {
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  on('classic.Stop', () => ({}))

  return mock.clock(on)
}

// Whether the band says this now.
async function says($: Engine, text: RegExp): Promise<boolean> {
  const ui = await $.ui.mount(BAND)
  const found = await ui.find({ type: 'Text', text })
  await ui.unmount()

  return found !== undefined
}

test('a turn that leaves a command running ends on waiting, not on rest', async ($, on) => {
  const clock = session(on)

  await $.turn.start({ text: 'build it', turnId: 't1' })
  await $.classic.Stop({
    ...STOP,
    background_tasks: [{ id: 'b1', type: 'shell', status: 'running', description: 'Build', command: 'make build' }],
  })
  await $.turn.complete({ answer: 'Started.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(await says($, /Done!/)).toBe(true)

  await clock.advance(9000)
  expect(await says($, /waiting on a background task/)).toBe(true)
  expect(await says($, /make build/)).toBe(true)
})

test('a turn with nothing left running ends on rest', async ($, on) => {
  const clock = session(on)

  await $.turn.start({ text: 'hello', turnId: 't1' })
  await $.classic.Stop({ ...STOP, background_tasks: [] })
  await $.turn.complete({ answer: 'Hi.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(9000)
  expect(await says($, /resting/)).toBe(true)
})

test('a turn an API error ended is not done', async ($, on) => {
  session(on)

  await $.turn.start({ text: 'hello', turnId: 't1' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'error' })
  expect(await says($, /went wrong/)).toBe(true)
})

test('a long call keeps the crab once a short one beside it returns', async ($, on) => {
  const clock = session(on)
  let finish = (): void => undefined
  on('tool.call', { tool: 'Agent' }, () => new Promise(resolve => (finish = () => resolve({ result: 'ok' }))))
  on('tool.call', { tool: 'Read' }, () => ({ result: 'ok' }))

  await $.turn.start({ text: 'review it', turnId: 't1' })
  const helper = $.tool.call({ tool: 'Agent', tool_use_id: 'a', description: 'Review the diff', prompt: 'x' })
  await clock.advance(0)
  await $.tool.call({ tool: 'Read', tool_use_id: 'r', file_path: '/repo/notes.md' })
  await clock.advance(3000)
  expect(await says($, /putting helpers to work/)).toBe(true)

  finish()
  await helper
})

test('a call that returns after its turn was interrupted leaves the crab at rest', async ($, on) => {
  const clock = session(on)
  let finish = (): void => undefined
  on('tool.call', { tool: 'Bash' }, () => new Promise(resolve => (finish = () => resolve({ result: 'stopped', isError: true }))))

  await $.turn.start({ text: 'run it', turnId: 't1' })
  const command = $.tool.call({ tool: 'Bash', tool_use_id: 'c', command: 'sleep 600' })
  await clock.advance(0)
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't1', reason: 'aborted' })
  finish()
  await command
  await clock.advance(5000)
  expect(await says($, /resting/)).toBe(true)
})

test('a long command shows its scene while it is still being written', async ($, on) => {
  const clock = session(on)
  let finish = (): void => undefined
  on('turn.step', async function* (_, e) {
    yield { kind: 'tool', index: 0, id: 'c', name: 'Bash' }
    yield { kind: 'input', index: 0, json: '{"command": "cat > notes.ts <<' }
    yield { kind: 'input', index: 0, json: "'EOF'\\nA long file" }
    await new Promise<void>(resolve => (finish = resolve))

    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'tool_use', usage: null }
  })

  await $.turn.start({ text: 'write the notes', turnId: 't1' })
  const step = (async () => {
    for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'm', messageCount: 1 })) {
      // The chunks reach the mod on their way here.
    }
  })()
  await clock.advance(0)
  expect(await says($, /writing code/)).toBe(true)

  finish()
  await step
})

test('the page of an artifact is designed, in the turn a design skill was loaded in', async ($, on) => {
  const clock = session(on)
  on('tool.call', { tool: 'Skill' }, () => ({ result: 'ok' }))
  on('tool.call', { tool: 'Write' }, () => ({ result: 'ok' }))

  await $.turn.start({ text: 'draw the tide table', turnId: 't1' })
  await $.tool.call({ tool: 'Skill', tool_use_id: 's', skill: 'artifact-design' })
  await clock.advance(1500)
  await $.tool.call({ tool: 'Write', tool_use_id: 'w', file_path: '/tmp/scratchpad/tide-table.html', content: '<title>' })
  await clock.advance(1500)
  expect(await says($, /is designing/)).toBe(true)
  expect(await says($, /tide-table\.html/)).toBe(true)
  await $.turn.complete({ answer: 'Drawn.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  await $.turn.start({ text: 'now fix the site', turnId: 't2' })
  await $.tool.call({ tool: 'Write', tool_use_id: 'w2', file_path: '/repo/site/index.html', content: '<title>' })
  await clock.advance(1500)
  expect(await says($, /writing code/)).toBe(true)
})

test('a command shows what it does in plain words, where it says so', async ($, on) => {
  const clock = session(on)
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ok' }))

  await $.turn.start({ text: 'check it', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'a', command: 'git status --short', description: 'Show working tree status' })
  await clock.advance(0)
  expect(await says($, /Show working tree status/)).toBe(true)
  expect(await says($, /git status/)).toBe(false)

  await clock.advance(1500)
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b', command: 'make build' })
  await clock.advance(1500)
  expect(await says($, /make build/)).toBe(true)
})

test('a long description stays whole over two lines, and is cut beyond them', async ($, on) => {
  const clock = session(on)
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ok' }))
  const long = 'Create the v0.1.1 branch and search the crab-cam plugin for scene selection logic'

  await $.turn.start({ text: 'look', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'a', command: 'ls', description: long })
  await clock.advance(0)
  expect(await says($, new RegExp(`^${long}$`))).toBe(true)

  await clock.advance(1500)
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b', command: 'ls', description: 'x'.repeat(200) })
  await clock.advance(1500)
  expect(await says($, /^x{139}…$/)).toBe(true)
})

test('a call still being written already says what it is about', async ($, on) => {
  const clock = session(on)
  let go = (): void => undefined
  on('turn.step', async function* (_, e) {
    yield { kind: 'tool', index: 0, id: 'w', name: 'Write' }
    yield { kind: 'input', index: 0, json: '{"file_path": "/repo/src/tide-table.ts", "content": "const' }
    await new Promise<void>(resolve => (go = resolve))
    yield { kind: 'tool', index: 1, id: 'c', name: 'Bash' }
    yield { kind: 'input', index: 1, json: '{"command": "git status --short && git log --oneline -3", ' }
    yield { kind: 'input', index: 1, json: '"description": "Show changed files"' }

    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'tool_use', usage: null }
  })

  await $.turn.start({ text: 'write it', turnId: 't1' })
  const step = (async () => {
    for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'm', messageCount: 1 })) {
      // The chunks reach the mod on their way here.
    }
  })()
  await clock.advance(0)
  expect(await says($, /writing code/)).toBe(true)
  expect(await says($, /^tide-table\.ts$/)).toBe(true)

  go()
  await step
  expect(await says($, /working with git/)).toBe(true)
  expect(await says($, /Show changed files/)).toBe(true)

})

test('commands shows a command as typed, and once more describes it again', async ($, on) => {
  const clock = session(on)
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ok' }))
  const toggle = () =>
    $.command.run({
      command: 'crab-cam',
      args: 'commands',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 120 },
    })

  await toggle()
  await $.turn.start({ text: 'check it', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'a', command: 'git status --short', description: 'Show working tree status' })
  await clock.advance(0)
  expect(await says($, /git status --short/)).toBe(true)

  await toggle()
  await clock.advance(1500)
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b', command: 'git log -3', description: 'Show the last three commits' })
  await clock.advance(1500)
  expect(await says($, /Show the last three commits/)).toBe(true)
})
