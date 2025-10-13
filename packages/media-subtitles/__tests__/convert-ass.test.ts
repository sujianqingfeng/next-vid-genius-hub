import { describe, it, expect } from 'vitest'
import { convertWebVttToAss, escapeForFFmpegFilterPath } from '@app/media-subtitles'

describe('convertWebVttToAss', () => {
  const vtt = [
    '00:00.000 --> 00:01.000',
    'Hello',
    '- 你好',
    '',
    '00:01.000 --> 00:02.500',
    'World',
    '- 世界',
  ].join('\n')

  it('generates valid ASS with bilingual lines and expected timings', async () => {
    const ass = await convertWebVttToAss(vtt, {
      fontSize: 20,
      textColor: '#ffffff',
      backgroundColor: '#000000',
      backgroundOpacity: 0.5,
      outlineColor: '#111111',
    })

    // Headers
    expect(ass).toContain('[Script Info]')
    expect(ass).toContain('[V4+ Styles]')
    expect(ass).toContain('[Events]')

    // Styles: English is 65% fontsize rounded; Chinese is base fontsize
    // 20 * 0.65 = 13
    expect(ass).toMatch(/Style: English,.*?,13[,]/)
    expect(ass).toMatch(/Style: Chinese,.*?,20[,]/)

    // Colors converted to ASS format (&HAABBGGRR)
    // textColor: #ffffff with opacity 1 -> alpha=00, BGR = ffffff
    expect(ass).toContain('&H00ffffff')
    // outlineColor: #111111 with opacity 0.9 -> alpha=~1a
    expect(ass.toLowerCase()).toContain('&h1a111111')
    // backgroundOpacity 0.5 -> alpha=80
    expect(ass.toLowerCase()).toContain('&h80000000')

    // Dialogues order: Chinese then English; times formatted HH:MM:SS.cs
    expect(ass).toContain('Dialogue: 0,0:00:00.00,0:00:01.00,Chinese')
    expect(ass).toContain('Dialogue: 0,0:00:00.00,0:00:01.00,English')
    expect(ass).toContain('Dialogue: 0,0:00:01.00,0:00:02.50,Chinese')
  })

  it('supports MM:SS.mmm and HH:MM:SS.mmm formats', async () => {
    const vttMixed = [
      '00:00:00.000 --> 00:00:01.123',
      'Line 1',
      '- 第一行',
      '00:01.000 --> 00:02.000',
      'Line 2',
      '- 第二行',
    ].join('\n')
    const ass = await convertWebVttToAss(vttMixed, {
      fontSize: 18,
      textColor: '#fff',
      backgroundColor: '#000',
      backgroundOpacity: 0.65,
      outlineColor: '#000',
    })
    expect(ass).toContain('0:00:00.00')
    expect(ass).toContain('0:00:01.12') // 123ms -> 12 centiseconds (rounded)
    expect(ass).toContain('0:00:01.00')
    expect(ass).toContain('0:00:02.00')
  })
})

describe('escapeForFFmpegFilterPath', () => {
  it('normalizes backslashes and escapes colon', () => {
    const input = 'C\\\\Videos Folder\\subtitle file.ass'
    const escaped = escapeForFFmpegFilterPath(input)
    expect(escaped).toBe('C\\:/Videos Folder/subtitle file.ass')
  })

  it('keeps unix-like paths unchanged except colon escaping', () => {
    const input = '/home/user/subs:track.ass'
    const escaped = escapeForFFmpegFilterPath(input)
    expect(escaped).toBe('/home/user/subs\\:track.ass')
  })
})

