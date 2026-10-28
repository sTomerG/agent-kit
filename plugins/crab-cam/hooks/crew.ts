import type { Activity, Crew, CrewBand, CrewGroup, CrewMember } from '../types'
import { DOING } from './activity'

// The crew's body colours in the order they are handed out; Claude's orange
// is Claude's alone. A seventh helper in one round starts over.
export const CREW_COLOURS = ['#1D9E75', '#7F77DD', '#D4537E', '#378ADD', '#BA7517', '#639922'] as const

export const MAX_STEPS = 50

export const NO_CREW: Crew = { members: [], workflows: [], now: 0 }

export const NO_BAND: CrewBand = { since: 0, crabs: [] }

export const colourOf = (member: CrewMember): string => CREW_COLOURS[member.seat % CREW_COLOURS.length] ?? CREW_COLOURS[0]

export const isWorking = (crew: Crew): boolean => crew.members.some(member => member.phase === 'working')

// What the band shows of a crew: each helper the pane shows, in its colour and
// phase, and when the first of them began.
export function bandOf(crew: Crew): CrewBand {
  const shown = crew.members.filter(member => member.group !== null)

  return shown.length === 0
    ? NO_BAND
    : {
        since: Math.min(...shown.map(member => member.startedAt)),
        crabs: shown.map(member => ({ colour: colourOf(member), phase: member.phase })),
      }
}

// Takes a helper on, the first time it is heard of. One that comes while none
// is at work starts a new round, the cards of the round before going, unless
// the round goes on: a workflow of it still runs, its agents one after another.
export function join(
  crew: Crew,
  id: string,
  now: number,
  upcoming: readonly string[],
  goesOn = false,
): { crew: Crew; isNewRound: boolean } {
  if (crew.members.some(member => member.id === id)) {
    return { crew, isNewRound: false }
  }

  const isNewRound = !isWorking(crew) && !goesOn
  const kept = isNewRound ? [] : crew.members
  const workflows = isNewRound ? [...upcoming] : crew.workflows
  const member: CrewMember = {
    id,
    group: null,
    about: null,
    type: null,
    seat: kept.length,
    startedAt: now,
    sceneAt: now,
    endedAt: null,
    phase: 'working',
    activity: 'thinking',
    detail: '',
    steps: [],
    model: null,
    tokens: null,
  }

  return { crew: { members: [...kept, member], workflows, now }, isNewRound }
}

// The crew with one helper changed; one it does not know is left out.
export function amend(crew: Crew, id: string, change: (member: CrewMember) => CrewMember): Crew {
  return { ...crew, members: crew.members.map(member => (member.id === id ? change(member) : member)) }
}

// The crew without one who turned out to be no one's helper.
export function leave(crew: Crew, id: string): Crew {
  return { ...crew, members: crew.members.filter(member => member.id !== id) }
}

// A call the helper made: the scene it is in now, and one more step. One
// that is through stays as it ended.
export function step(member: CrewMember, activity: Activity, detail: string, now: number): CrewMember {
  if (member.phase !== 'working') {
    return member
  }

  return {
    ...member,
    activity,
    detail,
    steps: [...member.steps, stepLine(activity, detail)].slice(-MAX_STEPS),
    sceneAt: activity === member.activity ? member.sceneAt : now,
  }
}

export function finish(member: CrewMember, hasFailed: boolean, now: number): CrewMember {
  return member.phase === 'working' ? { ...member, phase: hasFailed ? 'failed' : 'done', endedAt: now, sceneAt: now } : member
}

// What a helper did, in the words of the band's scenes: the main statement
// of a step, before what it was about.
const DID: Record<Activity, string> = {
  idle: 'Rested',
  thinking: 'Thought',
  reading: 'Read',
  coding: 'Wrote code',
  writing: 'Wrote text',
  designing: 'Designed',
  terminal: 'Ran a command',
  searching: 'Searched',
  web: 'Browsed',
  delegating: 'Delegated',
  talking: 'Replied',
  asking: 'Asked',
  planning: 'Planned',
  tool: 'Used a tool',
  done: 'Done',
  permission: 'Waited for permission',
  compacting: 'Tidied up',
  error: 'Got stuck',
  waiting: 'Waited',
  testing: 'Ran tests',
  git: 'Used git',
  installing: 'Installed',
  skill: 'Loaded a skill',
  memory: 'Remembered',
  sharing: 'Shared',
}

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

// A step as the card's list words it: what the helper did, then what about.
export const stepLine = (activity: Activity, detail: string): string =>
  detail === '' ? DID[activity] : `${DID[activity]} · ${detail}`

// The scene its crab acts out: its work, or done or oops once it is through.
export const sceneOf = (member: CrewMember): Activity =>
  member.phase === 'done' ? 'done' : member.phase === 'failed' ? 'error' : member.activity

// The line under its details: the main statement of what it is doing and
// what about, or how it ended.
export function sceneOfMember(member: CrewMember): { verb: string; subject: string } {
  if (member.phase === 'done') return { verb: 'Done', subject: '' }
  if (member.phase === 'failed') return { verb: 'Stopped before it finished', subject: '' }

  return { verb: capital(DOING[member.activity]), subject: member.detail }
}

export function sceneLine(member: CrewMember): string {
  const { verb, subject } = sceneOfMember(member)

  return subject === '' ? verb : `${verb} · ${subject}`
}

// A helper goes by what it is for: a subagent's task, a workflow agent's
// label. A workflow's agent without a label goes by its type and a number
// among those of that type.
export function titleOf(member: CrewMember, members: readonly CrewMember[]): string {
  if (member.group !== 'workflow') {
    return member.about ?? member.type ?? 'Subagent'
  }

  if (member.about !== null) {
    return member.about
  }

  const type = member.type ?? 'agent'
  const same = members.filter(other => other.group === 'workflow' && (other.type ?? 'agent') === type)

  return `${type} ${same.indexOf(member) + 1}`
}

export type CrewGroupView = { key: CrewGroup; heading: string; members: CrewMember[]; running: number }

// The two groups, subagents and the workflow's agents, each in start order;
// a group with no one in it is left out. Workflow agents cannot be told
// apart by workflow, so they share one group named after every one in play.
export function groupsOf(crew: Crew): CrewGroupView[] {
  const groups: CrewGroupView[] = []

  for (const key of ['subagent', 'workflow'] as const) {
    const members = crew.members.filter(member => member.group === key)

    if (members.length > 0) {
      const heading =
        key === 'subagent' ? 'Subagents' : crew.workflows.length > 0 ? `Workflow · ${crew.workflows.join(' + ')}` : 'Workflow'
      groups.push({ key, heading, members, running: members.filter(member => member.phase === 'working').length })
    }
  }

  return groups
}

// Minutes and seconds, with hours in front once there are any.
export function elapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const pad = (value: number) => String(value).padStart(2, '0')
  const [hours, minutes] = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60]

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds % 60)}` : `${minutes}:${pad(seconds % 60)}`
}

export const elapsedOf = (member: CrewMember, now: number): string =>
  elapsed((member.endedAt ?? Math.max(now, member.startedAt)) - member.startedAt)

export function tokensText(tokens: number): string {
  if (tokens < 1000) return `${tokens} tokens`
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1).replace(/\.0$/, '')}k tokens`

  return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, '')}M tokens`
}

// A model as people name it: `claude-haiku-5-5` is Haiku 5.5, and a date or
// a context size after the version is left off. An id of another shape stays
// as it is, less the `claude-` in front.
export function modelName(model: string): string {
  const match = /^claude-([a-z]+)-(\d{1,2}(?:-\d{1,2})*)(?!\d)/.exec(model)

  return match === null ? model.replace(/^claude-/, '') : `${capital(match[1] ?? '')} ${(match[2] ?? '').replaceAll('-', '.')}`
}

// What a card puts on its pills: its type, then its model and tokens once
// there is a reading of them. A workflow's agent without a label is titled by
// its type already, so the type is left out there.
export function pillsOf(member: CrewMember): string[] {
  const isTitledByType = member.group === 'workflow' && member.about === null

  return [
    isTitledByType ? null : member.type,
    member.model === null ? null : modelName(member.model),
    member.tokens === null ? null : tokensText(member.tokens),
  ].filter(part => part !== null)
}

// The name a Workflow call gives its workflow: its `name`, or the name in the
// script's meta block.
export function workflowNameOf(args: Readonly<Record<string, unknown>>): string | undefined {
  if (typeof args.name === 'string' && args.name !== '') {
    return args.name
  }

  const script = args.script

  return typeof script === 'string' ? /\bname\s*:\s*['"`]([^'"`]+)['"`]/.exec(script)?.[1] : undefined
}

// What the demo's sample crew does, one step every few seconds, and what each
// step is about.
type Work = readonly [Activity, string]

const PAUSE: Work = ['thinking', '']

const SAMPLE_WORK: readonly Work[] = [
  ['reading', 'register.tsx'],
  ['searching', 'helpersLine'],
  ['coding', 'crew.ts'],
  ['testing', 'claude plugin test plugins/crab-cam'],
  ['terminal', 'npx tsx scripts/make-demo.mts'],
  ['web', 'docs.anthropic.com'],
  ['git', 'git diff --stat'],
  ['thinking', ''],
]

// How long each turn of the demo's crew lasts: on each, one of them moves on.
export const SAMPLE_TURN_MS = 3000

// The demo's helpers; one with a last step is through once it is past it.
const SAMPLES: readonly (Pick<CrewMember, 'group' | 'about' | 'type' | 'model'> & { tokens: number; lastStep?: number })[] = [
  { group: 'subagent', about: 'Review the diff', type: 'general-purpose', model: 'claude-sonnet-5-5', tokens: 18400 },
  { group: 'subagent', about: 'Find the flaky test', type: 'Explore', model: 'claude-haiku-5-5', tokens: 9200, lastStep: 2 },
  { group: 'workflow', about: null, type: 'Explore', model: 'claude-haiku-5-5', tokens: 12100 },
  { group: 'workflow', about: null, type: 'Explore', model: 'claude-haiku-5-5', tokens: 7600, lastStep: 3 },
  { group: 'workflow', about: null, type: 'general-purpose', model: 'claude-opus-5-5', tokens: 31800 },
]

// The demo's crew as it stands so long after it started: two subagents and a
// workflow's three agents, each on its own stretch of the sample work, two of
// them through before the end. They take turns to move on, one every few
// seconds, so the cards do not all change at once.
export function sampleCrew(started: number, now: number): Crew {
  const turns = Math.floor((now - started) / SAMPLE_TURN_MS)
  const members = SAMPLES.map((sample, seat): CrewMember => {
    // The turns that were this helper's: the seat's first, then every round.
    const moves = turns > seat ? Math.floor((turns - 1 - seat) / SAMPLES.length) + 1 : 0
    const last = sample.lastStep ?? Infinity
    const isThrough = moves + 1 > last
    const done = Math.min(moves + 1, last)
    const work = Array.from({ length: done }, (_, at) => SAMPLE_WORK[(at + seat * 3) % SAMPLE_WORK.length] ?? PAUSE)
    const [activity, detail] = work[work.length - 1] ?? PAUSE
    // The turn of its k-th move, the last of which puts it through.
    const turnOf = (move: number) => started + (seat + 1 + (move - 1) * SAMPLES.length) * SAMPLE_TURN_MS
    const startedAt = started - seat * 4000

    return {
      id: `sample-${seat}`,
      group: sample.group,
      about: sample.about,
      type: sample.type,
      seat,
      startedAt,
      endedAt: isThrough ? turnOf(last) : null,
      sceneAt: isThrough ? turnOf(last) : moves === 0 ? startedAt : turnOf(moves),
      phase: isThrough ? 'done' : 'working',
      activity,
      detail,
      steps: work.map(([doing, about]) => stepLine(doing, about)),
      model: sample.model,
      tokens: sample.tokens + done * 1300,
    }
  })

  return { members, workflows: ['review-changes'], now }
}
