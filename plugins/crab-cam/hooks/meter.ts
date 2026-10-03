import type { Meter } from '../types'
import { GREY, ORANGE, SCENE_HEIGHT } from './scenes'

const RED = '#E5534B'
const HINGE = '#C9A66B'
const PEARL = '#F2C14E'

const SHELL_WIDTH = 80
const PEARLS_WIDTH = 52
const RIBS = 9
const FIVE_HOUR_PEARLS = 5
const WEEK_PEARLS = 7
// Past this share the last two units of a gauge turn red: nearly used up.
const NEARLY_FULL = 85

const round = (value: number) => Math.round(value * 10) / 10
const share = (percent: number) => Math.max(0, Math.min(1, percent / 100))

// How many of a gauge's units are lit: everything on the meter fills as it is
// used, the ribs with the context and the pearls with a rate-limit window.
const litOf = (used: number | null, units: number) => (used === null ? 0 : Math.round(share(used) * units))

// The colour of a lit unit, the last two red once the gauge is nearly full;
// nothing for a unit not reached yet, which its gauge draws as a ghost, so the
// whole scale is always in view.
function colourOf(unit: number, units: number, used: number | null, colour: string): string | undefined {
  if (unit >= litOf(used, units)) {
    return undefined
  }

  return (used ?? 0) > NEARLY_FULL && unit >= units - 2 ? RED : colour
}

// A row of pearls that light up one by one as a rate-limit window is used, the
// ones not reached yet in grey. Nothing where the account has no such window.
function pearls(x: number, y: number, radius: number, gap: number, units: number, used: number | null): string {
  if (used === null) {
    return ''
  }

  let row = ''

  for (let unit = 0; unit < units; unit++) {
    const fill = colourOf(unit, units, used, PEARL)

    row += `<circle cx="${round(x + unit * gap)}" cy="${y}" r="${radius}" fill="${fill ?? GREY}"${fill === undefined ? ' opacity="0.6"' : ''}/>`
  }

  return row
}

// How wide the meter is drawn: the shell alone where the account has no
// rate-limit window, the shell and its two rows of pearls otherwise.
export const meterWidth = (meter: Meter) => SHELL_WIDTH + (meter.fiveHour === null && meter.week === null ? 0 : PEARLS_WIDTH)

// The shell: nine ribs that colour in with the context. Beside it a row of five
// pearls for the five-hour window, and below that seven smaller ones for the week.
export function meterSvg(meter: Meter): string {
  const centerX = 40
  const centerY = 50
  const radius = 35
  const at = (degrees: number, length: number) => {
    const angle = (degrees * Math.PI) / 180

    return `${round(centerX + length * Math.sin(angle))},${round(centerY - length * Math.cos(angle))}`
  }
  const width = meterWidth(meter)
  let fan = ''

  for (let rib = 0; rib < RIBS; rib++) {
    const from = -71 + rib * 16
    const to = from + 14
    const fill = colourOf(rib, RIBS, meter.context, ORANGE)

    fan +=
      `<path d="M${centerX},${centerY} L${at(from, radius)} Q${at((from + to) / 2, radius * 1.1)} ${at(to, radius)} Z" ` +
      `fill="${fill ?? GREY}"${fill === undefined ? ' opacity="0.45"' : ''}/>`
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${SCENE_HEIGHT}" width="${width}" height="${SCENE_HEIGHT}" ` +
    `shape-rendering="geometricPrecision">` +
    fan +
    `<path d="M33,50 h14 l-2,6 h-10 Z" fill="${HINGE}"/>` +
    pearls(90.5, 23, 4, 9.1, FIVE_HOUR_PEARLS, meter.fiveHour) +
    pearls(89.3, 43, 2.8, 6.3, WEEK_PEARLS, meter.week) +
    `</svg>`
  )
}

// The meter in words, for whoever cannot see the drawing.
export function meterAlt(meter: Meter): string {
  const parts = [
    meter.context === null ? 'Context not measured yet' : `Context ${meter.context}% full`,
    meter.fiveHour === null ? '' : `5-hour limit ${meter.fiveHour}% used`,
    meter.week === null ? '' : `weekly limit ${meter.week}% used`,
  ]

  return parts.filter(part => part !== '').join(', ')
}

// The readings in words and figures, for beside the drawing: one line for each
// gauge that has a reading.
export function meterLines(meter: Meter): readonly { label: string; value: string }[] {
  return [
    meter.context === null ? undefined : { label: 'Context window', value: `${meter.context}% full` },
    meter.fiveHour === null ? undefined : { label: '5-hour limit', value: `${meter.fiveHour}% used` },
    meter.week === null ? undefined : { label: 'Weekly limit', value: `${meter.week}% used` },
  ].filter(line => line !== undefined)
}

const units = (lit: number, total: number, on: string, off: string) => on.repeat(lit) + off.repeat(total - lit)

// The terminal's meter: the ribs as a row of blocks, the pearls as dots.
export function meterRow(meter: Meter): string {
  return [
    units(litOf(meter.context, RIBS), RIBS, '▰', '▱'),
    meter.fiveHour === null ? '' : units(litOf(meter.fiveHour, FIVE_HOUR_PEARLS), FIVE_HOUR_PEARLS, '●', '○'),
    meter.week === null ? '' : units(litOf(meter.week, WEEK_PEARLS), WEEK_PEARLS, '●', '○'),
  ]
    .filter(part => part !== '')
    .join(' ')
}
