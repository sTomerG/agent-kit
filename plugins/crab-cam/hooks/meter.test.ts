import { expect, test } from 'claude-code/testing'

import { meterAlt, meterLines, meterRow, meterSvg, meterWidth } from './meter'

const RED = '#E5534B'

test('the terminal row fills with what is used', () => {
  expect(meterRow({ context: 0, fiveHour: null, week: null })).toBe('▱▱▱▱▱▱▱▱▱')
  expect(meterRow({ context: 50, fiveHour: null, week: null })).toBe('▰▰▰▰▰▱▱▱▱')
  expect(meterRow({ context: 100, fiveHour: 20, week: 100 })).toBe('▰▰▰▰▰▰▰▰▰ ●○○○○ ●●●●●●●')
})

test('a reading outside 0 to 100 stays on the scale', () => {
  expect(meterRow({ context: 140, fiveHour: -5, week: null })).toBe('▰▰▰▰▰▰▰▰▰ ○○○○○')
})

test('no pearls where the account has no rate-limit window', () => {
  expect(meterWidth({ context: 10, fiveHour: null, week: null })).toBe(80)
  expect(meterWidth({ context: 10, fiveHour: 5, week: null })).toBe(132)
  expect(meterSvg({ context: 10, fiveHour: null, week: null }).includes('<circle')).toBe(false)
  expect(meterSvg({ context: 10, fiveHour: 5, week: 5 }).includes('<circle')).toBe(true)
})

test('a gauge turns red only when nearly full', () => {
  expect(meterSvg({ context: 50, fiveHour: 50, week: 50 }).includes(RED)).toBe(false)
  expect(meterSvg({ context: 95, fiveHour: null, week: null }).includes(RED)).toBe(true)
})

test('the meter in words names only what is measured', () => {
  expect(meterAlt({ context: null, fiveHour: null, week: null })).toBe('Context not measured yet')
  expect(meterAlt({ context: 42, fiveHour: 10, week: 3 })).toBe('Context 42% full, 5-hour limit 10% used, weekly limit 3% used')
})

test('the readings in figures leave out what is not measured', () => {
  expect(meterLines({ context: null, fiveHour: null, week: null })).toEqual([])
  expect(meterLines({ context: 62, fiveHour: null, week: null })).toEqual([{ label: 'Context window', value: '62% full' }])
  expect(meterLines({ context: 62, fiveHour: 57, week: 41 })).toEqual([
    { label: 'Context window', value: '62% full' },
    { label: '5-hour limit', value: '57% used' },
    { label: 'Weekly limit', value: '41% used' },
  ])
})
