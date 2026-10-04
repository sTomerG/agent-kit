import type { Activity } from '../types'

export const ORANGE = '#D97757'
export const EYE = '#2B2520'
export const GREY = '#8C9199'
export const SLATE = '#5B6470'
export const PAPER = '#FFFFFF'
const YELLOW = '#F2C14E'
const GOLD = '#D9A21B'
const RED = '#E5534B'
const BLUE = '#6CB6FF'
const INK = '#1E1E28'
const LINE = '#B9BEC6'

export const SCENE_WIDTH = 128
export const SCENE_HEIGHT = 64

// The crab stands at one spot in every scene, so a change of scene moves only
// what is beside it.
const CRAB_X = 10
const CRAB_Y = 29

type Look = 'ahead' | 'up' | 'right' | 'closed'
type Arms = 'still' | 'typing' | 'wave' | 'cheer'

type Pose = {
  look?: Look
  arms?: Arms
  bob?: number
  isShaking?: boolean
  wear?: string
}

export type Drawing = { pose: Pose; prop: string }

// Scenes that share a pose share one crab drawing, which then stays as it is
// while the scene beside it changes: so the poses are few and named.
const WORK: Pose = { look: 'right' }
const TYPING: Pose = { look: 'right', arms: 'typing' }
const WAVING: Pose = { look: 'right', arms: 'wave' }

export const loop = (attribute: string, values: string, seconds: number, extra = '') =>
  `<animate attributeName="${attribute}" values="${values}" dur="${seconds}s" repeatCount="indefinite" ${extra}/>`

export const slide = (values: string, seconds: number, extra = '') =>
  `<animateTransform attributeName="transform" type="translate" values="${values}" dur="${seconds}s" repeatCount="indefinite" ${extra}/>`

const swing = (values: string, seconds: number) =>
  `<animateTransform attributeName="transform" type="rotate" values="${values}" dur="${seconds}s" repeatCount="indefinite"/>`

const stroke = (color: string, width: number) =>
  `fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`

const EYES: Record<Look, { dx: number; y: number; height: number }> = {
  ahead: { dx: 0, y: 6, height: 6 },
  up: { dx: 0, y: 4, height: 6 },
  right: { dx: 2, y: 6, height: 6 },
  closed: { dx: 0, y: 10, height: 1.5 },
}

const ARMS: Record<Arms, { y: number; left: string; right: string }> = {
  still: { y: 9, left: '', right: '' },
  typing: {
    y: 9,
    left: loop('y', '9;7;9', 0.3),
    right: loop('y', '9;7;9', 0.3, 'begin="0.15s"'),
  },
  wave: { y: 9, left: '', right: loop('y', '9;2;9', 0.7) },
  cheer: { y: 3, left: loop('y', '3;1;3', 0.5), right: loop('y', '3;1;3', 0.5, 'begin="0.25s"') },
}

function eye(x: number, look: Look): string {
  const { dx, y, height } = EYES[look]
  const blink =
    look === 'closed'
      ? ''
      : loop('height', `${height};${height};1;${height}`, 3.4, 'keyTimes="0;0.92;0.96;1"') +
        loop('y', `${y};${y};${y + 3};${y}`, 3.4, 'keyTimes="0;0.92;0.96;1"')

  return `<rect x="${x + dx}" y="${y}" width="4" height="${height}" fill="${EYE}">${blink}</rect>`
}

// The crab is 48 by 29 before scaling: body, two arms, two eyes, four legs.
function crab(x: number, y: number, pose: Pose, scale = 1, delay = 0): string {
  const { look = 'ahead', arms = 'still', bob = 1.6, isShaking = false, wear = '' } = pose
  const motion = isShaking ? slide('0 0;-1.6 0;1.6 0;0 0', 0.28) : slide('0 0;0 -1.6;0 0', bob, `begin="${delay}s"`)
  const legs = [9, 16, 28, 35].map(legX => `<rect x="${legX}" y="22" width="4" height="7"/>`).join('')

  return (
    `<g transform="translate(${x} ${y}) scale(${scale})">` +
    `<ellipse cx="24" cy="30" rx="19" ry="1.8" fill="#000" opacity="0.14"/>` +
    `<g>${motion}` +
    `<g fill="${ORANGE}">` +
    `<rect x="6" y="0" width="36" height="22"/>` +
    `<rect x="0" y="${ARMS[arms].y}" width="6" height="7">${ARMS[arms].left}</rect>` +
    `<rect x="42" y="${ARMS[arms].y}" width="6" height="7">${ARMS[arms].right}</rect>` +
    `${legs}</g>` +
    `${eye(13, look)}${eye(31, look)}${wear}` +
    `</g></g>`
  )
}

// A small crab beside the big one, as part of a scene's prop.
export const helper = (x: number, y: number, delay: number) => crab(x, y, { bob: 0.7 }, 0.5, delay)

export function bubble(inside: string): string {
  return (
    `<path d="M69,6 h44 a7,7 0 0 1 7,7 v20 a7,7 0 0 1 -7,7 h-33 l-14,9 l4,-9 h-1 a7,7 0 0 1 -7,-7 v-20 a7,7 0 0 1 7,-7 z" ` +
    `fill="${PAPER}" stroke="${GREY}" stroke-width="1.5" stroke-linejoin="round"/>` +
    inside
  )
}

export function gear(x: number, y: number, radius: number, seconds: number, turn: 1 | -1): string {
  const tooth = radius * 0.45
  const teeth = [0, 45, 90, 135, 180, 225, 270, 315]
    .map(
      angle =>
        `<rect x="${-tooth / 2}" y="${-radius * 1.35}" width="${tooth}" height="${radius * 0.6}" rx="1" transform="rotate(${angle})"/>`,
    )
    .join('')
  const hole = radius * 0.42
  const ring =
    `M${-radius},0 a${radius},${radius} 0 1,0 ${radius * 2},0 a${radius},${radius} 0 1,0 ${-radius * 2},0 ` +
    `M${-hole},0 a${hole},${hole} 0 1,1 ${hole * 2},0 a${hole},${hole} 0 1,1 ${-hole * 2},0`

  return (
    `<g transform="translate(${x} ${y})"><g fill="#7D8590">` +
    `<animateTransform attributeName="transform" type="rotate" from="0" to="${360 * turn}" dur="${seconds}s" repeatCount="indefinite"/>` +
    `${teeth}<path fill-rule="evenodd" d="${ring}"/></g></g>`
  )
}

export const pulse = (begin: number) => loop('opacity', '0.15;1;0.15', 1.5, `begin="${begin}s"`)

export const bar = (x: number, y: number, width: number, fill: string, extra = '') =>
  `<rect x="${x}" y="${y}" width="${width}" height="2.5" rx="1.25" fill="${fill}">${extra}</rect>`

export const sparkle = (x: number, y: number, begin: number) =>
  `<path transform="translate(${x} ${y})" d="M0,-6 L1.5,-1.5 L6,0 L1.5,1.5 L0,6 L-1.5,1.5 L-6,0 L-1.5,-1.5 Z" fill="#F2C14E" opacity="0.2">${pulse(begin)}</path>`

export const SCENES: Record<Activity, () => Drawing> = {
  idle: () => ({
    pose: { look: 'closed', bob: 3.2 },
    prop: [
      { x: 66, y: 31, size: 9, begin: 0 },
      { x: 76, y: 22, size: 12, begin: 0.5 },
      { x: 88, y: 12, size: 15, begin: 1 },
    ]
      .map(
        z =>
          `<text x="${z.x}" y="${z.y}" font-family="ui-monospace,Menlo,monospace" font-weight="700" font-size="${z.size}" fill="${GREY}" opacity="0.15">z${pulse(z.begin)}</text>`,
      )
      .join(''),
  }),

  thinking: () => {
    const puffs: readonly (readonly [number, number, number])[] = [
      [86, 19, 9],
      [98, 14, 11],
      [111, 18, 9],
      [98, 22, 9],
      [72, 22, 3.5],
      [64, 28, 2.2],
    ]
    const outline = puffs.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r + 1.4}" fill="${GREY}"/>`).join('')
    const fill = puffs.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${PAPER}"/>`).join('')
    const dots = [90, 98, 106]
      .map((x, i) => `<circle cx="${x}" cy="18" r="2.2" fill="${SLATE}" opacity="0.15">${pulse(i * 0.3)}</circle>`)
      .join('')

    return { pose: { look: 'up' }, prop: outline + fill + dots }
  },

  reading: () => ({
    pose: WORK,
    prop:
      `<path d="M74,8 h30 l10,10 v38 h-40 z" fill="${PAPER}" stroke="${LINE}" stroke-width="1.5" stroke-linejoin="round"/>` +
      `<path d="M104,8 v10 h10" ${stroke(LINE, 1.5)}/>` +
      [24, 30, 36, 42, 48].map((y, i) => bar(80, y, i % 2 === 0 ? 28 : 21, LINE)).join('') +
      `<rect x="75" y="20" width="38" height="5.5" rx="1.5" fill="${ORANGE}" opacity="0.35">${loop('y', '20;47;20', 3)}</rect>`,
  }),

  coding: () => {
    const lines: readonly (readonly [number, number, number, string])[] = [
      [72, 23, 20, '#C792EA'],
      [78, 29, 30, '#82AAFF'],
      [78, 35, 22, '#C3E88D'],
      [84, 41, 18, '#F78C6C'],
      [72, 47, 10, '#C792EA'],
    ]

    return {
      pose: TYPING,
      prop:
        `<rect x="66" y="8" width="54" height="48" rx="4" fill="${INK}"/>` +
        [RED, YELLOW, '#3FB950'].map((fill, i) => `<circle cx="${72 + i * 6}" cy="14.5" r="2" fill="${fill}"/>`).join('') +
        lines
          .map(([x, y, width, fill], i) =>
            bar(x, y, width, fill, loop('opacity', '0;0;1;1', 3.6, `keyTimes="0;${(0.08 + i * 0.16).toFixed(2)};${(0.12 + i * 0.16).toFixed(2)};1"`)),
          )
          .join(''),
    }
  },

  terminal: () => ({
    pose: TYPING,
    prop:
      `<rect x="64" y="10" width="58" height="44" rx="4" fill="${INK}"/>` +
      `<path d="M64,19 v-5 a4,4 0 0 1 4,-4 h50 a4,4 0 0 1 4,4 v5 z" fill="#3A3A46"/>` +
      `<polyline points="70,25 74,28.5 70,32" ${stroke('#7EE787', 2)}/>` +
      bar(79, 27.25, 24, '#8B949E') +
      `<rect x="70" y="39" width="46" height="7" rx="3.5" ${stroke('#8B949E', 1.2)}/>` +
      `<rect x="71.5" y="40.5" width="43" height="4" rx="2" fill="#7EE787">${loop('width', '0;43;43', 2.6, 'keyTimes="0;0.85;1"')}</rect>`,
  }),

  searching: () => ({
    pose: WORK,
    prop:
      [14, 22, 30, 38, 46].map((y, i) => bar(72, y, i % 2 === 0 ? 46 : 34, '#B9BEC6')).join('') +
      `<g>${slide('0 0;14 -4;22 8;4 10;0 0', 4)}` +
      `<line x1="77" y1="35" x2="64" y2="47" stroke="${SLATE}" stroke-width="5" stroke-linecap="round"/>` +
      `<circle cx="86" cy="26" r="12" fill="#BFE3FF" fill-opacity="0.55" stroke="${SLATE}" stroke-width="3.5"/>` +
      `<path d="M79,22 a8,8 0 0 1 6,-5" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>` +
      `</g>`,
  }),

  web: () => ({
    pose: WORK,
    prop:
      `<rect x="64" y="10" width="58" height="44" rx="4" fill="${PAPER}" stroke="${LINE}" stroke-width="1.5"/>` +
      `<path d="M64,21 v-7 a4,4 0 0 1 4,-4 h50 a4,4 0 0 1 4,4 v7 z" fill="#E3E6EA" stroke="${LINE}" stroke-width="1.5"/>` +
      [RED, YELLOW, '#3FB950'].map((fill, i) => `<circle cx="${69.5 + i * 5}" cy="15.5" r="1.6" fill="${fill}"/>`).join('') +
      `<rect x="86" y="13" width="31" height="5" rx="2.5" fill="${PAPER}"/>` +
      `<rect x="65" y="21" width="56" height="2.2" fill="${BLUE}">${loop('width', '0;56;56', 1.8, 'keyTimes="0;0.8;1"')}</rect>` +
      `<rect x="70" y="28" width="18" height="14" rx="2" fill="#BFE3FF"/>` +
      bar(92, 29, 23, LINE) +
      bar(92, 34.5, 16, LINE) +
      bar(92, 40, 21, LINE) +
      bar(70, 46.5, 40, LINE) +
      `<g>${slide('102 46;110 36;97 31;102 46', 3)}<path d="M0,0 L0,11 L3,8.2 L5.4,13 L7.4,12 L5,7.4 L9,7.4 Z" fill="${EYE}" stroke="${PAPER}" stroke-width="0.9"/></g>`,
  }),

  delegating: () => ({
    pose: WAVING,
    prop: helper(66, 40, 0) + helper(96, 40, 0.35) + helper(81, 18, 0.2),
  }),

  talking: () => ({
    pose: {},
    prop: bubble(
      bar(69, 14, 44, GREY, loop('width', '0;44;44;44', 3.2, 'keyTimes="0;0.3;0.95;1"')) +
        bar(69, 21.5, 38, GREY, loop('width', '0;0;38;38;38', 3.2, 'keyTimes="0;0.3;0.6;0.95;1"')) +
        bar(69, 29, 26, GREY, loop('width', '0;0;26;26', 3.2, 'keyTimes="0;0.6;0.85;1"')),
    ),
  }),

  asking: () => ({
    pose: { arms: 'wave' },
    prop: bubble(
      `<text x="91" y="33" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="800" font-size="28" fill="${ORANGE}">?${loop('opacity', '1;0.35;1', 1.4)}</text>`,
    ),
  }),

  planning: () => ({
    pose: WORK,
    prop:
      `<polygon points="68,14 84,10 100,14 118,10 118,50 100,54 84,50 68,54" fill="#E8F0D8" stroke="#A8B88A" stroke-width="1.5" stroke-linejoin="round"/>` +
      `<path d="M84,10 v40 M100,14 v40" ${stroke('#C6D3A8', 1.2)}/>` +
      `<path d="M74,46 C80,36 88,44 94,34 S106,28 110,22" ${stroke(ORANGE, 2.5)} stroke-dasharray="3 4">${loop('stroke-dashoffset', '7;0', 0.7)}</path>` +
      `<circle cx="74" cy="46" r="3" fill="${SLATE}"/>` +
      `<g>${slide('0 0;0 -2.5;0 0', 0.9)}<line x1="110" y1="22" x2="110" y2="8" ${stroke(SLATE, 2)}/><polygon points="110,8 120,11.5 110,15" fill="${RED}"/></g>`,
  }),

  tool: () => ({
    pose: TYPING,
    prop: gear(88, 28, 13, 5, 1) + gear(112, 46, 7, 2.7, -1),
  }),

  done: () => ({
    pose: { arms: 'cheer', bob: 0.6 },
    prop:
      sparkle(66, 12, 0) +
      sparkle(112, 48, 0.5) +
      sparkle(116, 12, 1) +
      `<g transform="translate(90 28)"><g>` +
      `<animateTransform attributeName="transform" type="scale" values="0.6;1.25;1" dur="0.45s" fill="freeze"/>` +
      `<circle r="11" fill="#2DA44E"/>` +
      `<polyline points="-5,0 -1.5,4 5.5,-4" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` +
      `</g></g>`,
  }),

  permission: () => ({
    pose: { arms: 'wave' },
    prop:
      `<g>` +
      `<animateTransform attributeName="transform" type="rotate" values="-5 94 40;5 94 40;-5 94 40" dur="0.9s" repeatCount="indefinite"/>` +
      `<path d="M85,30 v-8 a9,9 0 0 1 18,0 v8" fill="none" stroke="${SLATE}" stroke-width="4.5" stroke-linecap="round"/>` +
      `<rect x="78" y="29" width="32" height="24" rx="4" fill="#F2C14E"/>` +
      `<circle cx="94" cy="38" r="3.5" fill="#7A5B12"/><rect x="92.5" y="39" width="3" height="8" rx="1" fill="#7A5B12"/>` +
      `</g>`,
  }),

  compacting: () => {
    const dust: readonly (readonly [number, number, number, number])[] = [
      [108, 55, 2.6, 0],
      [114, 51, 2, 0.2],
      [120, 56, 1.8, 0.4],
      [104, 50, 1.6, 0.5],
    ]

    return {
      pose: TYPING,
      prop:
        dust
          .map(
            ([x, y, r, begin]) =>
              `<circle cx="${x}" cy="${y}" r="${r}" fill="${GREY}" opacity="0.2">${pulse(begin)}${slide('0 0;5 -3;0 0', 1, `begin="${begin}s"`)}</circle>`,
          )
          .join('') +
        `<g>${swing('-10 76 8;10 76 8;-10 76 8', 1)}` +
        `<line x1="76" y1="8" x2="90" y2="44" ${stroke('#B08968', 3.5)}/>` +
        `<polygon points="82,43 99,40 104,56 80,58" fill="${YELLOW}" stroke="${GOLD}" stroke-width="1.5" stroke-linejoin="round"/>` +
        `<path d="M86,47 l-1,9 M92,46 l0,10 M98,45 l2,9" ${stroke(GOLD, 1.2)}/>` +
        `</g>`,
    }
  },

  error: () => ({
    pose: { look: 'up', isShaking: true },
    prop:
      `<g>${loop('opacity', '1;0.55;1', 0.8)}` +
      `<path d="M94,10 L116,50 L72,50 Z" fill="#E5534B" stroke="#E5534B" stroke-width="4" stroke-linejoin="round"/>` +
      `<rect x="92" y="22" width="4" height="15" rx="2" fill="#FFFFFF"/><circle cx="94" cy="43.5" r="2.5" fill="#FFFFFF"/>` +
      `</g>`,
  }),

  waiting: () => {
    const ticks = [0, 90, 180, 270]
      .map(angle => `<rect x="93" y="15" width="2" height="4" fill="${SLATE}" transform="rotate(${angle} 94 31)"/>`)
      .join('')

    return {
      pose: WORK,
      prop:
        `<circle cx="94" cy="31" r="19" fill="${PAPER}" stroke="${SLATE}" stroke-width="3"/>` +
        ticks +
        `<line x1="94" y1="31" x2="102" y2="31" stroke="${SLATE}" stroke-width="3" stroke-linecap="round"/>` +
        `<line x1="94" y1="31" x2="94" y2="18" stroke="${ORANGE}" stroke-width="2.5" stroke-linecap="round">` +
        `<animateTransform attributeName="transform" type="rotate" from="0 94 31" to="360 94 31" dur="4s" repeatCount="indefinite"/>` +
        `</line><circle cx="94" cy="31" r="2.5" fill="${SLATE}"/>`,
    }
  },

  testing: () => {
    const rows = [17, 26, 35, 44]
      .map(
        (y, i) =>
          `<circle cx="78" cy="${y + 1.25}" r="3" fill="#3FB950">` +
          loop('fill', '#6E7681;#6E7681;#3FB950;#3FB950', 3.6, `keyTimes="0;${0.1 + i * 0.2};${0.15 + i * 0.2};1"`) +
          `</circle>` +
          bar(85, y, i % 2 === 0 ? 24 : 18, '#8B949E'),
      )
      .join('')

    return {
      pose: WORK,
      prop: `<rect x="68" y="9" width="50" height="46" rx="4" fill="#1E1E28"/>` + rows,
    }
  },

  git: () => {
    const branch = 'M80,44 C88,44 86,20 94,20 H104 C112,20 110,44 118,44'

    return {
      pose: WORK,
      prop:
        `<line x1="66" y1="44" x2="122" y2="44" stroke="#6CB6FF" stroke-width="3" stroke-linecap="round"/>` +
        `<path d="${branch}" fill="none" stroke="#C792EA" stroke-width="3" stroke-linecap="round"/>` +
        [70, 80, 118].map(x => `<circle cx="${x}" cy="44" r="4.5" fill="#6CB6FF"/>`).join('') +
        [94, 104].map(x => `<circle cx="${x}" cy="20" r="4.5" fill="#C792EA"/>`).join('') +
        `<circle r="3" fill="#FFFFFF" stroke="${SLATE}" stroke-width="1.5"><animateMotion dur="2.2s" repeatCount="indefinite" path="${branch}"/></circle>`,
    }
  },

  installing: () => ({
    pose: WORK,
    prop:
      `<g fill="none" stroke="#2DA44E" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">` +
      slide('0 0;0 8;0 0', 1.2) +
      `<line x1="94" y1="6" x2="94" y2="20"/><polyline points="87,14 94,21 101,14"/></g>` +
      `<rect x="74" y="32" width="40" height="24" rx="2" fill="#C9A27A"/>` +
      `<rect x="72" y="29" width="44" height="6" rx="1.5" fill="#B08968"/>` +
      `<rect x="90.5" y="29" width="7" height="27" fill="#E8D3B0"/>`,
  }),

  skill: () => ({
    pose: {
      look: 'right',
      wear:
        `<polygon points="24,-11 48,-4 24,3 0,-4" fill="${EYE}"/><rect x="13" y="-2" width="22" height="4" fill="${EYE}"/>` +
        `<line x1="42" y1="-4" x2="42" y2="5" stroke="#F2C14E" stroke-width="2"/><circle cx="42" cy="6" r="2" fill="#F2C14E"/>`,
    },
    prop:
      `<g transform="translate(94 30)"><g>` +
      `<animateTransform attributeName="transform" type="scale" values="1;1.15;1" dur="1.4s" repeatCount="indefinite"/>` +
      `<polygon points="0,-17 5,-6 17,-5 8,3 11,15 0,9 -11,15 -8,3 -17,-5 -5,-6" fill="#F2C14E" stroke="#D9A21B" stroke-width="1.5" stroke-linejoin="round"/>` +
      `</g></g>` +
      sparkle(116, 12, 0) +
      sparkle(72, 50, 0.7),
  }),

  memory: () => ({
    pose: WORK,
    prop:
      `<g transform="rotate(-4 94 32)">` +
      `<path d="M74,14 h40 v30 l-8,8 h-32 z" fill="#FFE27A"/><path d="M114,44 l-8,8 v-8 z" fill="#E0BE45"/>` +
      bar(80, 24, 28, '#B59B2D', loop('width', '0;28;28', 3, 'keyTimes="0;0.3;1"')) +
      bar(80, 31, 28, '#B59B2D', loop('width', '0;0;28;28', 3, 'keyTimes="0;0.3;0.6;1"')) +
      bar(80, 38, 18, '#B59B2D', loop('width', '0;0;18;18', 3, 'keyTimes="0;0.6;0.85;1"')) +
      `<circle cx="94" cy="15" r="4" fill="#E5534B"/><circle cx="92.8" cy="13.8" r="1.2" fill="#FFFFFF" opacity="0.7"/>` +
      `</g>`,
  }),

  sharing: () => ({
    pose: WAVING,
    prop:
      `<path d="M62,50 C74,50 78,44 84,38" fill="none" stroke="${GREY}" stroke-width="2" stroke-dasharray="3 4" stroke-linecap="round"/>` +
      `<g transform="translate(84 34)"><g>${slide('0 0;10 -8;0 0', 2.4)}` +
      `<polygon points="0,-2 30,-14 10,4" fill="${PAPER}" stroke="${SLATE}" stroke-width="1.5" stroke-linejoin="round"/>` +
      `<polygon points="10,4 30,-14 13,14" fill="#D9DEE4" stroke="${SLATE}" stroke-width="1.5" stroke-linejoin="round"/>` +
      `</g></g>`,
  }),
}

// A scene is two drawings side by side: the crab on the left, which changes
// only with its pose, and what the scene puts beside it on the right.
const SPLIT = 60

export const CRAB_WIDTH = SPLIT
export const PROP_WIDTH = SCENE_WIDTH - SPLIT

const frame = (x: number, width: number, inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} 0 ${width} ${SCENE_HEIGHT}" ` +
  `width="${width}" height="${SCENE_HEIGHT}" shape-rendering="geometricPrecision">${inner}</svg>`

export function crabSvg(activity: Activity): string {
  return frame(0, CRAB_WIDTH, crab(CRAB_X, CRAB_Y, SCENES[activity]().pose))
}

export function propSvg(activity: Activity): string {
  return frame(SPLIT, PROP_WIDTH, SCENES[activity]().prop)
}

// Crab and prop as one drawing, for a page that shows a scene on its own.
export function drawingSvg(drawing: Drawing): string {
  return frame(0, SCENE_WIDTH, crab(CRAB_X, CRAB_Y, drawing.pose) + drawing.prop)
}

const CRAB_ROWS = [' ▐▛███▜▌ ', '▝▜█████▛▘', '  ▘▘ ▝▝  '] as const

type Frame = readonly [string, string, string]

const NO_PROP: Frame = ['', '', '']

const PROPS: Record<Activity, readonly Frame[]> = {
  idle: [
    ['    ', ' z  ', '    '],
    ['  z ', ' z  ', '    '],
    ['   Z', '  z ', '    '],
  ],
  thinking: [
    [' ╭─────╮', '°│ ·   │', ' ╰─────╯'],
    [' ╭─────╮', '°│ ··  │', ' ╰─────╯'],
    [' ╭─────╮', '°│ ··· │', ' ╰─────╯'],
  ],
  reading: [
    ['┌──┬──┐', '│≡≡│≡≡│', '└──┴──┘'],
    ['┌──┬──┐', '│≡─│≡≡│', '└──┴──┘'],
    ['┌──┬──┐', '│≡≡│≡─│', '└──┴──┘'],
  ],
  coding: [
    ['┌─────┐', '│</>▌ │', '▀▀▀▀▀▀▀'],
    ['┌─────┐', '│</>  │', '▀▀▀▀▀▀▀'],
  ],
  terminal: [
    ['┌─────┐', '│$ ▌  │', '▀▀▀▀▀▀▀'],
    ['┌─────┐', '│$    │', '▀▀▀▀▀▀▀'],
  ],
  searching: [
    ['╭─╮≡≡≡≡', '╰─╯≡≡≡≡', '≡≡≡╲≡≡≡'],
    ['≡≡╭─╮≡≡', '≡≡╰─╯≡≡', '≡≡≡≡≡╲≡'],
    ['≡≡≡≡╭─╮', '≡≡≡≡╰─╯', '≡≡≡≡≡≡≡'],
  ],
  web: [
    ['┌○○○──┐', '│█░░░░│', '└─────┘'],
    ['┌○○○──┐', '│███░░│', '└─────┘'],
    ['┌○○○──┐', '│█████│', '└─────┘'],
    ['┌○○○──┐', '│≡≡≡≡ │', '└─────┘'],
  ],
  delegating: [
    ['           ', '▗▟█▙▖ ▗▟█▙▖', ' ▘ ▝   ▘ ▝ '],
    ['▗▟█▙▖      ', ' ▘ ▝  ▗▟█▙▖', '       ▘ ▝ '],
  ],
  talking: [
    ['≡≡≡▌  ', '      ', '      '],
    ['≡≡≡≡≡≡', '≡≡≡▌  ', '      '],
    ['≡≡≡≡≡≡', '≡≡≡≡≡≡', '≡≡≡▌  '],
  ],
  asking: [
    ['╭─╮', ' ╭╯', ' ● '],
    ['╭─╮', ' ╭╯', ' ○ '],
  ],
  planning: [
    ['       ', '       ', '●─╯    '],
    ['       ', '  ╭─╯  ', '●─╯    '],
    ['    ╭─◆', '  ╭─╯  ', '●─╯    '],
    ['    ╭─◆', '  ╭─╯  ', '●─╯    '],
  ],
  tool: [
    ['   ', ' ╋ ', '   '],
    ['   ', ' ╳ ', '   '],
  ],
  done: [
    [' ▐███▌ ', '  ▀█▀  ', '  ▄█▄  '],
    ['·▐███▌·', '  ▀█▀  ', '  ▄█▄  '],
  ],
  permission: [
    ['┌──────┐', '│ y/n▌ │', '└──────┘'],
    ['┌──────┐', '│ y/n  │', '└──────┘'],
  ],
  compacting: [
    ['   ╱   ', '  ╱    ', ' ▟ ·:· '],
    ['    ╱  ', '   ╱   ', '  ▟ ·: '],
    ['     ╱ ', '    ╱  ', '   ▟ · '],
  ],
  error: [
    [' ╻  ', ' ┃  ', ' ●  '],
    ['  ╻ ', '  ┃ ', '  ● '],
  ],
  waiting: [
    ['╭───╮', '│ ╵ │', '╰───╯'],
    ['╭───╮', '│ ╶ │', '╰───╯'],
    ['╭───╮', '│ ╷ │', '╰───╯'],
    ['╭───╮', '│ ╴ │', '╰───╯'],
  ],
  testing: [
    ['· ──', '· ──', '· ──'],
    ['✓ ──', '· ──', '· ──'],
    ['✓ ──', '✓ ──', '· ──'],
    ['✓ ──', '✓ ──', '✓ ──'],
  ],
  git: [
    ['  ●─●  ', ' ╱   ╲ ', '●──●──●'],
    ['  ●─◉  ', ' ╱   ╲ ', '●──●──●'],
    ['  ●─●  ', ' ╱   ╲ ', '●──●──◉'],
  ],
  installing: [
    ['  ▼  ', '     ', '╰───╯'],
    ['  │  ', '  ▼  ', '╰───╯'],
    ['  │  ', '  │  ', '╰─▼─╯'],
  ],
  skill: [
    [' ★ ', '   ', '   '],
    ['   ', ' ★ ', '   '],
  ],
  memory: [
    ['  ▼  ', '┌───┐', '│≡≡≡│'],
    ['     ', '┌─▼─┐', '│≡≡≡│'],
    ['     ', '┌─▼─┐', '│≡≡≡│'],
  ],
  sharing: [
    ['     ', '     ', '╰─▲─╯'],
    ['     ', '  ▲  ', '╰─│─╯'],
    ['  ▲  ', '  │  ', '╰───╯'],
  ],
}

// The terminal has no vector leaf: the crab is three rows of block glyphs, with
// the scene's prop beside it, one of a few frames picked by the running tick.
export function sceneRows(activity: Activity, tick: number): { crab: Frame; prop: Frame } {
  const frames = PROPS[activity]

  return { crab: CRAB_ROWS, prop: frames[tick % frames.length] ?? NO_PROP }
}
