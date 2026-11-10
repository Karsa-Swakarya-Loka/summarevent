/** Event wizard, denah step: selling fewer seats than the layout has, and closing a whole row. */
import { describe, expect, it } from 'vitest'
import { changeVenue, distributeRows, emptyForm, maxSellable, rowClosed, sellableSeats, sellOnly, templateForVenue, toggleRow, type LayoutForm } from '@/components/admin/wizard/model'
import type { Venue } from '@/domain/types'

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

describe('seat map size follows the venue', () => {
  const venues: Venue[] = [
    { id: 'v_ciunik', name: 'Atrium Ciunik', capacity: 200 },
    { id: 'v_sawarga', name: 'Sawarga Courtyard', capacity: 96 },
    { id: 'v_cileutik', name: 'Atrium Cileutik', capacity: 60 },
    { id: 'v_mini', name: 'Ruang kecil', capacity: 20 },
  ]

  it('picks the biggest template that fits the capacity, the smallest when none fits', () => {
    expect(templateForVenue(200).name).toBe('Atrium besar')
    expect(templateForVenue(96).name).toBe('Courtyard')
    expect(templateForVenue(95).name).toBe('Teater kecil')
    expect(templateForVenue(20).name).toBe('Teater kecil')
    expect(templateForVenue(undefined).name).toBe('Teater kecil')
  })

  it('a new event starts at the first venue\'s size', () => {
    const L = emptyForm(venues).layout
    expect([L.rows, L.seatsPerRow, L.aisleAfter]).toEqual([10, 14, 7])
  })

  it('another venue resizes the untouched seat map, but never one the panitia changed', () => {
    const form = emptyForm(venues)
    const small = changeVenue(form, 'v_cileutik', venues)
    expect(small.venueId).toBe('v_cileutik')
    expect([small.layout.rows, small.layout.seatsPerRow, small.layout.aisleAfter]).toEqual([6, 10, 5])
    // back again: still untouched, so it follows
    expect(changeVenue(small, 'v_ciunik', venues).layout.rows).toBe(10)
    // a size, a closed seat or a curve the panitia set stays
    for (const layout of [{ ...form.layout, rows: 9 }, { ...form.layout, blocked: ['A1'] }, { ...form.layout, curved: true }]) {
      const kept = changeVenue({ ...form, layout }, 'v_cileutik', venues)
      expect(kept.venueId).toBe('v_cileutik')
      expect(kept.layout).toBe(layout)
    }
  })

  it('row ranges the wizard spread by itself are spread again for the new size, ranges the panitia set stay', () => {
    const base = emptyForm(venues)
    const opened = { ...base, layout: { ...base.layout, ranges: distributeRows(base) } }
    const moved = changeVenue(opened, 'v_cileutik', venues)
    expect(moved.layout.rows).toBe(6)
    expect(Math.max(...moved.layout.ranges.map((r) => r.to))).toBe(5)
    const custom = { ...opened, layout: { ...opened.layout, ranges: opened.layout.ranges.map((r) => ({ ...r, to: 3 })) } }
    expect(changeVenue(custom, 'v_cileutik', venues).layout).toBe(custom.layout)
  })
})
