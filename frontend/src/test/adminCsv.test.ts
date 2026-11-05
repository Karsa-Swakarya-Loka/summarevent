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

  it('nomor HP tidak kehilangan angka 0 di depan', () => {
    expect(excelCell('081234567890')).toBe('0812-3456-7890')
    expect(excelCell('081200000019')).toBe('0812-0000-0019')
  })

  it('angka biasa dan kode tidak diubah', () => {
    expect(excelCell('600000')).toBe('600000')
    expect(excelCell('SEV-8YAUK3')).toBe('SEV-8YAUK3')
    expect(excelCell('A6 A7')).toBe('A6 A7')
  })

  it('isian yang mirip rumus tampil sebagai teks', () => {
    expect(excelCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`)
    expect(excelCell('+62812')).toBe("'+62812")
    expect(excelCell('@budi')).toBe("'@budi")
  })

  it('baris diakhiri CRLF dan sel berkoma tetap berkutip', () => {
    expect(excelCsv('Nama,Sesi\nRina,"Sesi 1 Sab, 21 Nov"')).toBe('Nama,Sesi\r\nRina,"Sesi 1 Sab, 21 Nov"')
  })
})
