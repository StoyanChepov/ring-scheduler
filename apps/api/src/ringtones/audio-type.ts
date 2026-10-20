/**
 * Works out the audio format from the file's first bytes. The browser's
 * declared MIME type is just a claim; this makes sure only real audio files
 * of a format Android can play get stored and sent to phones.
 */
export function detectAudioType(data: Buffer): string | null {
  const ascii = (start: number, end: number) =>
    data.subarray(start, end).toString('latin1');

  if (ascii(0, 3) === 'ID3') return 'audio/mpeg';
  // An MP3 without ID3 tags starts with an MPEG frame sync (11 set bits).
  if (data.length > 1 && data[0] === 0xff && (data[1] & 0xe0) === 0xe0) {
    return 'audio/mpeg';
  }
  if (ascii(0, 4) === 'OggS') return 'audio/ogg';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'audio/wav';
  // MP4/M4A: a box whose type at bytes 4-8 is "ftyp".
  if (ascii(4, 8) === 'ftyp') return 'audio/mp4';

  return null;
}
