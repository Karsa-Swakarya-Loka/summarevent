/** Event wizard, denah step: selling fewer seats than the layout has, and closing a whole row. */
import { describe, expect, it } from 'vitest'
import { maxSellable, rowClosed, sellableSeats, sellOnly, toggleRow, type LayoutForm } from '@/components/admin/wizard/model'

/** 4 rows (A–D) of 6 seats, rows A–B one category and C–D another. */
const layout = (over: Partial<LayoutForm> = {}): LayoutForm => ({
  rows: 4,
  seatsPerRow: 6,
  aisleAfter: null,
  ranges: [
    { key: 'r1', catKey: 'vip', from: 0, to: 1 },
    { key: 'r2', catKey: 'reg', from: 2, to: 3 },
  ],
  blocked: [],
  priority: [],
  ...over,
})

describe('sell only part of the layout', () => {
  it('closes the back row first, from the two ends toward the middle', () => {
    const l = layout()
    expect(maxSellable(l)).toBe(24)
    const blocked = sellOnly(l, 20)
    expect(blocked).toHaveLength(4)
    expect(new Set(blocked)).toEqual(new Set(['D1', 'D6', 'D2', 'D5']))
    expect(sellableSeats({ ...l, blocked })).toBe(20)
    // past one row it moves on to the row in front
    expect(sellOnly(l, 16)).toEqual(expect.arrayContaining(['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'C1', 'C6']))
  })

  it('never closes a priority seat, and only counts rows that have a category', () => {
    const l = layout({ priority: ['D1'], ranges: [{ key: 'r1', catKey: 'vip', from: 0, to: 2 }] })
    expect(maxSellable(l)).toBe(18)
    const blocked = sellOnly(l, 17)
    expect(blocked).not.toContain('D1')
    expect(blocked).toEqual(['C1'])
  })

  it('opens the seats it closed before one closed by hand, and stays within the layout', () => {
    const camera = layout({ blocked: ['A3'] })
    const fewer = sellOnly(camera, 19)
    expect(fewer).toContain('A3')
    const more = sellOnly({ ...camera, blocked: fewer }, 22)
    expect(more).toContain('A3')
    expect(sellableSeats({ ...camera, blocked: more })).toBe(22)
    expect(sellOnly(camera, 999)).toEqual([])
    expect(sellOnly(camera, -5)).toHaveLength(24)
  })
})

describe('close a whole row', () => {
  it('closes every seat of the row, then opens them again', () => {
    const l = layout({ blocked: ['B2'] })
    const closed = toggleRow(l, 1)
    expect(closed).toEqual(['B2', 'B1', 'B3', 'B4', 'B5', 'B6'])
    expect(rowClosed({ ...l, blocked: closed }, 1)).toBe(true)
    expect(toggleRow({ ...l, blocked: closed }, 1)).toEqual([])
    expect(rowClosed(l, 1)).toBe(false)
  })
})
