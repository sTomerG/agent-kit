export type Activity =
  | 'idle'
  | 'thinking'
  | 'reading'
  | 'coding'
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

declare module 'claude-code' {
  interface PluginState {
    'crab-cam': { scene: Scene; isHidden: boolean; frame: number; meter: Meter; isMetered: boolean; isDetailed: boolean }
  }
}
