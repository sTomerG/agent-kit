// Writes the README's animations with the mod's own drawings, as the desktop
// app draws them: assets/demo-scenes.svg loops through a few scenes,
// assets/demo-meter.svg fills the meter, and assets/demo-meter-details.svg does
// the same with the readings beside it (`/crab-cam details`). Run: npx tsx scripts/make-demo.mts
import { mkdirSync, writeFileSync } from 'node:fs'

import { meterLines, meterSvg, meterWidth } from '../hooks/meter'
import { CRAB_WIDTH, PROP_WIDTH, SCENE_HEIGHT, crabSvg, propSvg } from '../hooks/scenes'

const OUT = new URL('../assets', import.meta.url).pathname

const SCENES = [
  ['thinking', 'Claude is thinking', ''],
  ['reading', 'Claude is reading', 'register.tsx'],
  ['searching', 'Claude is searching', 'activityOf'],
  ['coding', 'Claude is writing code', 'activity.ts'],
  ['testing', 'Claude is running tests', 'claude plugin test plugins/crab-cam'],
  ['git', 'Claude is working with git', 'git commit -m "Recognise shell commands"'],
  ['done', 'Done!', ''],
] as const

// Context, five-hour and weekly use in percents, step by step up to nearly full.
const READINGS = [
  [4, 6, 12],
  [18, 14, 16],
  [33, 26, 22],
  [48, 41, 30],
  [62, 57, 41],
  [77, 72, 55],
  [89, 90, 70],
  [98, 97, 88],
] as const

const HEIGHT = 128
const SCALE = 1.5
const PAD = 24
const TOP = (HEIGHT - SCENE_HEIGHT * SCALE) / 2
const SANS = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`
const MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'
const TEXT = '#F5F4EF'
const DIM = '#A8A69D'

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const short = (value: number) => String(Math.round(value * 10000) / 10000)

// A drawing of the mod, placed in the band at a size: its own <svg>, nested.
const place = (svg: string, x: number, width: number) =>
  svg
    .replace(/^<svg /, `<svg x="${x}" y="${TOP}" `)
    .replace(/ width="[\d.]+" height="[\d.]+"/, ` width="${width}" height="${SCENE_HEIGHT * SCALE}"`)

// One step of a loop: shown for its own stretch and hidden for the rest.
function step(index: number, steps: number, seconds: number, inside: string): string {
  const from = index / steps
  const to = (index + 1) / steps
  const [values, keyTimes] =
    index === 0 ? ['1;0', `0;${short(to)}`] : to === 1 ? ['0;1', `0;${short(from)}`] : ['0;1;0', `0;${short(from)};${short(to)}`]

  return (
    `<g opacity="${index === 0 ? 1 : 0}">` +
    `<animate attributeName="opacity" calcMode="discrete" values="${values}" keyTimes="${keyTimes}" dur="${steps * seconds}s" repeatCount="indefinite"/>` +
    inside +
    `</g>`
  )
}

// The band the drawings stand in: a dark panel, so it reads on any page.
const band = (width: number, label: string, inside: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${HEIGHT}" width="${width}" height="${HEIGHT}" ` +
  `font-family="${SANS}" role="img" aria-label="${escape(label)}">` +
  `<rect width="${width}" height="${HEIGHT}" rx="14" fill="#262624"/>` +
  `<rect x="0.5" y="0.5" width="${width - 1}" height="${HEIGHT - 1}" rx="13.5" fill="none" stroke="#3D3D3A"/>` +
  inside +
  `</svg>\n`

function scenesDemo(): string {
  const textX = PAD + (CRAB_WIDTH + PROP_WIDTH) * SCALE + 24
  const steps = SCENES.map(([activity, label, detail], index) =>
    step(
      index,
      SCENES.length,
      2.5,
      place(crabSvg(activity), PAD, CRAB_WIDTH * SCALE) +
        place(propSvg(activity), PAD + CRAB_WIDTH * SCALE, PROP_WIDTH * SCALE) +
        `<text x="${textX}" y="${detail === '' ? 71 : 60}" font-size="20" font-weight="600" fill="${TEXT}">${escape(label)}</text>` +
        (detail === '' ? '' : `<text x="${textX}" y="86" font-size="13" fill="${DIM}" font-family="${MONO}">${escape(detail)}</text>`),
    ),
  )

  return band(600, 'crab-cam: a crab above the prompt acts out what Claude is doing', steps.join(''))
}

// The meter filling up: the shell alone, as it stands by default, or with its
// readings spelled out beside it (`/crab-cam details`).
function meterDemo(detailed: boolean): string {
  const steps = READINGS.map(([context, fiveHour, week], index) => {
    const meter = { context, fiveHour, week }
    const textX = PAD + meterWidth(meter) * SCALE + 28
    const lines = meterLines(meter)
      .map(
        (line, row) =>
          `<text x="${textX}" y="${44 + row * 26}" font-size="15" fill="${DIM}">${line.label}</text>` +
          `<text x="${textX + 170}" y="${44 + row * 26}" font-size="15" font-weight="600" fill="${TEXT}" text-anchor="end">${line.value}</text>`,
      )
      .join('')

    return step(index, READINGS.length, 1.5, place(meterSvg(meter), PAD, meterWidth(meter) * SCALE) + (detailed ? lines : ''))
  })

  return detailed
    ? band(444, 'crab-cam meter with details: the readings in figures beside the shell and the pearls', steps.join(''))
    : band(246, 'crab-cam meter: the shell fills with the context window, the pearls with the rate limits', steps.join(''))
}

mkdirSync(OUT, { recursive: true })
writeFileSync(`${OUT}/demo-scenes.svg`, scenesDemo())
writeFileSync(`${OUT}/demo-meter.svg`, meterDemo(false))
writeFileSync(`${OUT}/demo-meter-details.svg`, meterDemo(true))
