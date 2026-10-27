import type { Elements } from 'claude-code'

import type { Crew, CrewMember, CrewView } from '../types'
import type { CrewGroupView } from './crew'
import { chipsOf, colourOf, elapsedOf, groupsOf, sceneLine, sceneOf, titleOf } from './crew'
import { CRAB_WIDTH, PROP_WIDTH, SCENE_HEIGHT, crabSvg, propSvg, sceneRows } from './scenes'

export const PANE = 'crab-crew'
export const PANE_TITLE = 'Crab crew'

// A card's drawing is the band's at three quarters of its size.
const CARD_SCALE = 0.75

type Table = Elements['terminal'] | Elements['desktop'] | Elements['vscode'] | Elements['mobile']

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
// crab in that colour, its prop stepping with the tick.
function crabOf(table: Table, member: CrewMember, tick: number) {
  const { Box, Text } = table
  const activity = sceneOf(member)
  const colour = colourOf(member)

  if ('Svg' in table) {
    const { Svg } = table
    const height = SCENE_HEIGHT * CARD_SCALE

    return (
      <Box flexDirection="row" flexShrink={0}>
        <Svg source={crabSvg(activity, colour)} alt={`A crab in ${colour}`} width={CRAB_WIDTH * CARD_SCALE} height={height} />
        <Svg source={propSvg(activity)} alt={sceneLine(member)} width={PROP_WIDTH * CARD_SCALE} height={height} />
      </Box>
    )
  }

  const rows = sceneRows(activity, tick)

  return (
    <Box flexDirection="row" gap={1} flexShrink={0}>
      <Box flexDirection="column" flexShrink={0}>
        {rows.crab.map((row, index) => crabRow(table, row, index, colour))}
      </Box>
      <Box flexDirection="column" flexShrink={0}>
        {rows.prop.map(row => (
          <Text dimColor>{row === '' ? ' ' : row}</Text>
        ))}
      </Box>
    </Box>
  )
}

function card(table: Table, member: CrewMember, crew: Crew, view: CrewView, tick: number) {
  const { Box, Button, Text } = table
  const colour = colourOf(member)
  const isOpen = view.open.includes(member.id)
  const count = member.steps.length
  const about = [member.type, elapsedOf(member, crew.now)].filter(part => part !== null).join(' · ')

  return (
    <Box
      key={`card-${member.id}`}
      flexDirection="column"
      borderStyle="round"
      borderColor={member.phase === 'working' ? colour : 'gray'}
      paddingX={1}
      width="100%"
    >
      <Box flexDirection="row" gap={2} width="100%">
        {crabOf(table, member, tick)}
        <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
          <Text bold wrap="truncate-end">
            {titleOf(member, crew.members)}
          </Text>
          <Box flexDirection="row" gap={1}>
            <Text dimColor wrap="truncate-end">
              {about}
            </Text>
            {chipsOf(member).map(chip => (
              <Text color="#FFFFFF" backgroundColor={colour}>
                {` ${chip} `}
              </Text>
            ))}
          </Box>
          <Text wrap="truncate-end">{sceneLine(member)}</Text>
          {count > 0 && (
            <Button key={stepsKey(member.id)} plain dimColor onPress={() => undefined}>
              {`${isOpen ? '▾' : '▸'} ${count === 1 ? '1 step' : `${count} steps`}`}
            </Button>
          )}
        </Box>
      </Box>
      {isOpen &&
        member.steps.map(line => (
          <Text dimColor wrap="truncate-end">
            {`  ${line}`}
          </Text>
        ))}
    </Box>
  )
}

function group(table: Table, shown: CrewGroupView, crew: Crew, view: CrewView, tick: number) {
  const { Box, Button } = table
  const isFolded = view.folded.includes(shown.key)
  const label = `${isFolded ? '▸' : '▾'} ${shown.heading} · ${shown.running} of ${shown.members.length} running`

  return (
    <Box key={`group-box-${shown.key}`} flexDirection="column" width="100%">
      <Button key={groupKey(shown.key)} plain onPress={() => undefined}>
        {label}
      </Button>
      {!isFolded && shown.members.map(member => card(table, member, crew, view, tick))}
    </Box>
  )
}

// The pane: the crew by group, or a word on what will show here.
export function crewTree(table: Table, crew: Crew, view: CrewView, tick: number) {
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
      {groups.map(shown => group(table, shown, crew, view, tick))}
    </Box>
  )
}
