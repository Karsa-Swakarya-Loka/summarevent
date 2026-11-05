import { describe, expect, it } from 'vitest'
import { excelCell, excelCsv, parseCsv } from '@/components/admin/csv'

describe('CSV unduhan panitia aman dibuka di Excel', () => {
  it('membaca sel berkutip, koma, dan kutip ganda', () => {
    expect(parseCsv('a,"b, c","d ""e"""\n1,2,3')).toEqual([
      ['a', 'b, c', 'd "e"'],
      ['1', '2', '3'],
    ])
  })

  it('sel kosong di akhir baris tetap ada', () => {
    expect(parseCsv('a,b,\nc,d,')).toEqual([
      ['a', 'b', ''],
      ['c', 'd', ''],
    ])
  })

  it('membaca baris baru di dalam sel berkutip', () => {
    expect(parseCsv('a,"baris 1\nbaris 2"\n1,2\n')).toEqual([
      ['a', 'baris 1\nbaris 2'],
      ['1', '2'],
    ])
  })

  it('nomor HP tidak kehilangan angka 0 di depan, hanya di kolom HP', () => {
    expect(excelCell('081234567890', { phone: true })).toBe('0812-3456-7890')
    expect(excelCsv('Kode,No HP,Ref\nSEV-1,081200000019,0123456789')).toBe('Kode,No HP,Ref\r\nSEV-1,0812-0000-0019,0123456789')
  })

  it('angka biasa dan kode tidak diubah', () => {
    expect(excelCell('600000')).toBe('600000')
    expect(excelCell('-50000')).toBe('-50000')
    expect(excelCell('SEV-8YAUK3')).toBe('SEV-8YAUK3')
    expect(excelCell('A6 A7')).toBe('A6 A7')
  })

  it('isian yang mirip rumus tampil sebagai teks', () => {
    expect(excelCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`)
    expect(excelCell('+SUM(A1:A9)')).toBe("'+SUM(A1:A9)")
    expect(excelCell('-1+cmd')).toBe("'-1+cmd")
    expect(excelCell('@budi')).toBe("'@budi")
  })

  it('baris diakhiri CRLF dan sel berkoma tetap berkutip', () => {
    expect(excelCsv('Nama,Sesi\nRina,"Sesi 1 Sab, 21 Nov"')).toBe('Nama,Sesi\r\nRina,"Sesi 1 Sab, 21 Nov"')
  })
})
