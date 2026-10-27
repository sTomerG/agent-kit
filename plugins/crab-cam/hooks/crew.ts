import type { Activity, Crew, CrewGroup, CrewMember } from '../types'
import { DOING } from './activity'

// The crew's body colours in the order they are handed out, Claude's orange
// first; an eighth helper in one round starts over.
export const CREW_COLOURS = ['#D97757', '#1D9E75', '#7F77DD', '#D4537E', '#378ADD', '#BA7517', '#639922'] as const

export const MAX_STEPS = 50

export const NO_CREW: Crew = { members: [], workflows: [], now: 0 }

export const colourOf = (member: CrewMember): string => CREW_COLOURS[member.seat % CREW_COLOURS.length] ?? CREW_COLOURS[0]

export const isWorking = (crew: Crew): boolean => crew.members.some(member => member.phase === 'working')

// Takes a helper on, the first time it is heard of. One that comes while none
// is at work starts a new round: the cards of the round before go.
export function join(crew: Crew, id: string, now: number, upcoming: readonly string[]): { crew: Crew; isNewRound: boolean } {
  if (crew.members.some(member => member.id === id)) {
    return { crew, isNewRound: false }
  }

  const isNewRound = !isWorking(crew)
  const kept = isNewRound ? [] : crew.members
  const workflows = isNewRound ? [...upcoming] : crew.workflows
  const member: CrewMember = {
    id,
    group: null,
    about: null,
    type: null,
    seat: kept.length,
    startedAt: now,
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

// A call the helper made: the scene it is in now, and one more step.
export function step(member: CrewMember, activity: Activity, detail: string): CrewMember {
  return { ...member, activity, detail, steps: [...member.steps, stepLine(activity, detail)].slice(-MAX_STEPS) }
}

export function finish(member: CrewMember, hasFailed: boolean, now: number): CrewMember {
  return member.phase === 'working' ? { ...member, phase: hasFailed ? 'failed' : 'done', endedAt: now } : member
}

// A step in the band's wording: what the helper did, and what it was about.
export const stepLine = (activity: Activity, detail: string): string =>
  detail === '' ? DOING[activity] : `${DOING[activity]} · ${detail}`

// The scene its crab acts out: its work, or done or oops once it is through.
export const sceneOf = (member: CrewMember): Activity =>
  member.phase === 'done' ? 'done' : member.phase === 'failed' ? 'error' : member.activity

// The line under its title: what it is doing, or how it ended.
export function sceneLine(member: CrewMember): string {
  if (member.phase === 'done') return 'done'
  if (member.phase === 'failed') return 'stopped before it finished'

  return stepLine(member.activity, member.detail)
}

// A subagent goes by what it is for; a workflow's agents have nothing to say
// so, and go by their type and a number among those of that type.
export function titleOf(member: CrewMember, members: readonly CrewMember[]): string {
  if (member.group !== 'workflow') {
    return member.about ?? member.type ?? 'Subagent'
  }

  const type = member.type ?? 'agent'
  const same = members.filter(other => other.group === 'workflow' && (other.type ?? 'agent') === type)

  return `${type} ${same.indexOf(member) + 1}`
}

export type CrewGroupView = { key: CrewGroup; heading: string; members: CrewMember[]; running: number }

// The two groups, subagents and the workflow's agents, each in start order;
// a group with no one in it is left out. Workflow agents cannot be told
// apart by workflow, so they share one group headed by every name in play.
export function groupsOf(crew: Crew): CrewGroupView[] {
  const groups: CrewGroupView[] = []

  for (const key of ['subagent', 'workflow'] as const) {
    const members = crew.members.filter(member => member.group === key)

    if (members.length > 0) {
      const heading = key === 'subagent' ? 'Subagents' : crew.workflows.length > 0 ? crew.workflows.join(' + ') : 'Workflow'
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

// A model by the part of its id that tells it apart: `claude-haiku-5-5` is
// `haiku-5-5`.
export const shortModel = (model: string): string => model.replace(/^claude-/, '')

// The line under a card's title: its type, how long it has been at work, and
// its model and tokens once there is a reading. A workflow's agent is titled
// by its type already, so the type is left out there.
export function detailsOf(member: CrewMember, now: number): string {
  return [
    member.group === 'workflow' ? null : member.type,
    elapsedOf(member, now),
    member.model === null ? null : shortModel(member.model),
    member.tokens === null ? null : tokensText(member.tokens),
  ]
    .filter(part => part !== null)
    .join(' · ')
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

const SAMPLES: readonly (Pick<CrewMember, 'group' | 'about' | 'type' | 'model'> & { tokens: number; endsAt?: number })[] = [
  { group: 'subagent', about: 'Review the diff', type: 'general-purpose', model: 'claude-sonnet-5-5', tokens: 18400 },
  { group: 'subagent', about: 'Find the flaky test', type: 'Explore', model: 'claude-haiku-5-5', tokens: 9200, endsAt: 5 },
  { group: 'workflow', about: null, type: 'Explore', model: 'claude-haiku-5-5', tokens: 12100 },
  { group: 'workflow', about: null, type: 'Explore', model: 'claude-haiku-5-5', tokens: 7600, endsAt: 8 },
  { group: 'workflow', about: null, type: 'general-purpose', model: 'claude-opus-5-5', tokens: 31800 },
]

// The demo's crew as it stands after so many of its steps: two subagents and
// a workflow's three agents, each on its own stretch of the sample work, two
// of them through before the end.
export function sampleCrew(index: number, started: number, now: number): Crew {
  const members = SAMPLES.map((sample, seat): CrewMember => {
    const done = Math.min(index, sample.endsAt ?? index) + 1
    const work = Array.from({ length: done }, (_, at) => SAMPLE_WORK[(at + seat * 3) % SAMPLE_WORK.length] ?? PAUSE)
    const [activity, detail] = work[work.length - 1] ?? PAUSE
    const isThrough = sample.endsAt !== undefined && index >= sample.endsAt

    return {
      id: `sample-${seat}`,
      group: sample.group,
      about: sample.about,
      type: sample.type,
      seat,
      startedAt: started - seat * 4000,
      endedAt: isThrough ? started + (sample.endsAt ?? 0) * 3000 : null,
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
