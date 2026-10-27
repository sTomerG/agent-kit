export type Activity =
  | 'idle'
  | 'thinking'
  | 'reading'
  | 'coding'
  | 'writing'
  | 'designing'
  | 'terminal'
  | 'searching'
  | 'web'
  | 'delegating'
  | 'talking'
  | 'asking'
  | 'planning'
  | 'tool'
  | 'done'
  | 'permission'
  | 'compacting'
  | 'error'
  | 'waiting'
  | 'testing'
  | 'git'
  | 'installing'
  | 'skill'
  | 'memory'
  | 'sharing'

export type Scene = { activity: Activity; detail: string }

// What the shell meter shows, each in whole percents used: the context
// window's fill, and the five-hour and weekly rate-limit windows. `null` where
// there is no reading: before the first response, or off a subscription.
export type Meter = { context: number | null; fiveHour: number | null; week: number | null }

// A helper in the Crab crew pane: a subagent or one of a workflow's agents,
// from its first event until the next round of helpers starts. Its group is
// null until it is known which of the two it is; it is not drawn till then.
export type CrewGroup = 'subagent' | 'workflow'
export type CrewPhase = 'working' | 'done' | 'failed'
export type CrewMember = {
  id: string
  group: CrewGroup | null
  // What the call that started it says it is for; workflow agents have none.
  about: string | null
  // The agent definition it runs as (`Explore`, `general-purpose`), once known.
  type: string | null
  // Which colour its crab has: its place in the round.
  seat: number
  startedAt: number
  endedAt: number | null
  // When the scene its crab acts out now began: a new one starts from its
  // beginning, as the band's do.
  sceneAt: number
  phase: CrewPhase
  activity: Activity
  detail: string
  // Its calls in the band's wording, the latest last, at most 50.
  steps: string[]
  model: string | null
  // The tokens of its latest request: what it has in hand.
  tokens: number | null
}

// The round of helpers the pane shows, the names of the workflows running in
// it, and the time the elapsed times run to.
export type Crew = { members: CrewMember[]; workflows: string[]; now: number }

// Which cards have their steps unfolded and which groups are folded, by id.
export type CrewView = { open: string[]; folded: string[] }

declare module 'claude-code' {
  interface PluginState {
    'crab-cam': {
      scene: Scene
      isHidden: boolean
      frame: number
      meter: Meter
      isMetered: boolean
      isDetailed: boolean
      isRaw: boolean
      crew: Crew
      // The demo's sample crew, drawn instead of the real one while it plays.
      demoCrew: Crew | null
      crewView: CrewView
      isCrewAuto: boolean
    }
  }
}
