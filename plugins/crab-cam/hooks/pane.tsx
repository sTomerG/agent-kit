import type { Elements, RenderSurface } from 'claude-code'

import type { Crew, CrewMember, CrewView } from '../types'
import type { CrewGroupView } from './crew'
import { colourOf, detailsOf, groupsOf, sceneLine, sceneOf, sceneOfMember, titleOf, usageOf } from './crew'
import { CRAB_WIDTH, PROP_WIDTH, SCENE_HEIGHT, crabSvg, propSvg, resumed, sceneRows } from './scenes'

export const PANE = 'crab-crew'
export const PANE_TITLE = 'Crab crew'

// A card's drawing is the band's at three quarters of its size, its crab
// lifted to stand level with the prop beside it, mid-card.
const CARD_SCALE = 0.75
const CARD_LIFT = 10

// A drawn card is calm: a light fill and a faint edge, the helper's colour in
// its crab alone, and its model and tokens on pills a shade darker. Theme
// colours, so light and dark themes each get their own.
const CARD_FILL = 'userMessageBackgroundHover'
const CARD_EDGE = 'subtle'
const PILL_FILL = 'userMessageBackground'

type Table = Elements['terminal'] | Elements['desktop'] | Elements['vscode'] | Elements['mobile']

// The surfaces that draw vector drawings and fills; the terminal draws glyphs.
const isDrawn = (surface: RenderSurface): boolean => surface !== 'terminal'

// The keys of the pane's buttons, which the ui.press hooks go by.
export const stepsKey = (id: string) => `steps-${id}`
export const groupKey = (key: string) => `group-${key}`

// The eyes are the gaps in the top row's quadrant glyphs, so they show whatever
// is behind the cell. Claude's own mascot paints that stretch black; without
// it the eyes turn white on a light terminal.
export function crabRow(table: Elements['terminal'], row: string, index: number, colour: string) {
  const { Box, Text } = table
  const eyes = row.indexOf('▛')
  if (index !== 0 || eyes === -1) return <Text color={colour}>{row}</Text>
  const end = row.indexOf('▜') + 1

  return (
    <Box flexDirection="row">
      <Text color={colour}>{row.slice(0, eyes)}</Text>
      <Text color={colour} backgroundColor="black">
        {row.slice(eyes, end)}
      </Text>
      <Text color={colour}>{row.slice(end)}</Text>
    </Box>
  )
}

// What the cards stand beside: a crab in the helper's colour acting out its
// scene. The terminal has no vector drawing, so there it is the band's glyph
// crab in that colour, its prop stepping with the tick. The desktop draws the
// pane's drawings afresh on every redraw, which would start them over each
// second; they are drawn as far in as they have been running instead: the crab
// since its helper began, the prop since its scene did.
function crabOf(table: Table, surface: RenderSurface, member: CrewMember, tick: number, now: number) {
  const { Box, Text } = table
  const activity = sceneOf(member)
  const colour = colourOf(member)

  if (isDrawn(surface) && 'Svg' in table) {
    const { Svg } = table
    const height = SCENE_HEIGHT * CARD_SCALE

    return (
      <Box key={`drawing-${member.id}`} flexDirection="row" flexShrink={0}>
        <Svg
          key={`crab-${member.id}`}
          source={resumed(crabSvg(activity, colour, CARD_LIFT), (now - member.startedAt) / 1000)}
          alt={`A crab in ${colour}`}
          width={CRAB_WIDTH * CARD_SCALE}
          height={height}
        />
        <Svg
          key={`prop-${member.id}`}
          source={resumed(propSvg(activity), (now - member.sceneAt) / 1000)}
          alt={sceneLine(member)}
          width={PROP_WIDTH * CARD_SCALE}
          height={height}
        />
      </Box>
    )
  }

  // A terminal's table, whatever its type says beside it.
  const glyphs = table as Elements['terminal']
  const rows = sceneRows(activity, tick)

  return (
    <Box flexDirection="row" gap={1} flexShrink={0}>
      <Box flexDirection="column" flexShrink={0}>
        {rows.crab.map((row, index) => crabRow(glyphs, row, index, colour))}
      </Box>
      <Box flexDirection="column" flexShrink={0}>
        {rows.prop.map(row => (
          <Text dimColor>{row === '' ? ' ' : row}</Text>
        ))}
      </Box>
    </Box>
  )
}

function card(table: Table, surface: RenderSurface, member: CrewMember, crew: Crew, view: CrewView, tick: number, now: number) {
  const { Box, Button, Text } = table
  const isFilled = isDrawn(surface)
  const scene = sceneOfMember(member)
  const isOpen = view.open.includes(member.id)
  const count = member.steps.length
  const usage = usageOf(member)
  // The terminal has no fills to draw pills with: there the model and tokens
  // join the details, and the edge keeps the helper's colour while it works.
  const details = isFilled ? detailsOf(member, crew.now) : [detailsOf(member, crew.now), ...usage].join(' · ')
  const edge = isFilled ? CARD_EDGE : member.phase === 'working' ? colourOf(member) : 'gray'

  return (
    <Box
      key={`card-${member.id}`}
      flexDirection="column"
      borderStyle="round"
      borderColor={edge}
      backgroundColor={isFilled ? CARD_FILL : undefined}
      paddingX={1}
      width="100%"
    >
      <Box flexDirection="row" alignItems="center" gap={2} width="100%">
        {crabOf(table, surface, member, tick, now)}
        <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
          <Text bold wrap="truncate-end">
            {titleOf(member, crew.members)}
          </Text>
          <Text dimColor wrap="truncate-end">
            {details}
          </Text>
          <Box flexDirection="row" gap={1} width="100%">
            <Box flexShrink={0}>
              <Text>{scene.verb}</Text>
            </Box>
            {scene.subject !== '' && (
              <Box flexShrink={1} minWidth={0}>
                <Text dimColor wrap="truncate-end">
                  {`· ${scene.subject}`}
                </Text>
              </Box>
            )}
          </Box>
          {isFilled && usage.length > 0 && (
            <Box flexDirection="row" gap={1}>
              {usage.map(part => (
                <Box key={`pill-${member.id}-${part}`} backgroundColor={PILL_FILL} paddingX={1} flexShrink={0}>
                  <Text dimColor backgroundColor={PILL_FILL}>
                    {part}
                  </Text>
                </Box>
              ))}
            </Box>
          )}
          {count > 0 && (
            <Button key={stepsKey(member.id)} plain dimColor onPress={() => undefined}>
              {`${isOpen ? '⌄' : '›'} Steps (${count})`}
            </Button>
          )}
        </Box>
      </Box>
      {isOpen &&
        member.steps.map(line => (
          <Text dimColor wrap="truncate-end">
            {`› ${line}`}
          </Text>
        ))}
    </Box>
  )
}

// A group's heading: its fold and name on the left, how many of it are still
// at work on the right.
function group(table: Table, surface: RenderSurface, shown: CrewGroupView, crew: Crew, view: CrewView, tick: number, now: number) {
  const { Box, Button, Text } = table
  const isFolded = view.folded.includes(shown.key)

  return (
    <Box key={`group-box-${shown.key}`} flexDirection="column" width="100%">
      <Box flexDirection="row" justifyContent="space-between" width="100%">
        <Button key={groupKey(shown.key)} plain onPress={() => undefined}>
          {`${isFolded ? '›' : '⌄'} ${shown.heading}`}
        </Button>
        <Text dimColor>{`${shown.running} of ${shown.members.length} running`}</Text>
      </Box>
      {!isFolded && (
        <Box flexDirection="column" gap={1} width="100%">
          {shown.members.map(member => card(table, surface, member, crew, view, tick, now))}
        </Box>
      )}
    </Box>
  )
}

// The pane: the crew by group, or a word on what will show here, drawn at the
// time given.
export function crewTree(table: Table, surface: RenderSurface, crew: Crew, view: CrewView, tick: number, now: number) {
  const { Box, Text } = table
  const groups = groupsOf(crew)

  if (groups.length === 0) {
    return (
      <Box flexDirection="column" width="100%">
        <Text dimColor>No crew yet. A card shows up here for every helper Claude puts to work.</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" gap={1} width="100%">
      {groups.map(shown => group(table, surface, shown, crew, view, tick, now))}
    </Box>
  )
}
