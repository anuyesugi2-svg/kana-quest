import { describe, expect, it } from 'vitest';
import { gradeKana, gradeMeaning, gradeRomaji } from '../src/core/grading';

describe('gradeRomaji', () => {
  it('accepts Hepburn and kunrei spellings', () => {
    expect(gradeRomaji('shi', 'し')).toBe(true);
    expect(gradeRomaji('si', 'し')).toBe(true);
    expect(gradeRomaji('tsu', 'つ')).toBe(true);
    expect(gradeRomaji('tu', 'つ')).toBe(true);
    expect(gradeRomaji('chi', 'ち')).toBe(true);
    expect(gradeRomaji('ti', 'ち')).toBe(true);
    expect(gradeRomaji('fu', 'ふ')).toBe(true);
    expect(gradeRomaji('hu', 'ふ')).toBe(true);
    expect(gradeRomaji('ja', 'じゃ')).toBe(true);
    expect(gradeRomaji('zya', 'じゃ')).toBe(true);
  });

  it('is case- and space-insensitive', () => {
    expect(gradeRomaji(' KA ', 'か')).toBe(true);
    expect(gradeRomaji('Gak Kou', 'がっこう')).toBe(true);
  });

  it('rejects wrong answers', () => {
    expect(gradeRomaji('ka', 'き')).toBe(false);
    expect(gradeRomaji('', 'か')).toBe(false);
    expect(gradeRomaji('sha', 'しょ')).toBe(false);
    expect(gradeRomaji('kite', 'きって')).toBe(false);
  });

  it('handles ぢ/づ/を', () => {
    expect(gradeRomaji('ji', 'ぢ')).toBe(true);
    expect(gradeRomaji('zu', 'づ')).toBe(true);
    expect(gradeRomaji('wo', 'を')).toBe(true);
    expect(gradeRomaji('o', 'を', ['o'])).toBe(true);
    expect(gradeRomaji('o', 'を')).toBe(false);
  });

  it('handles small っ, long vowels and macrons', () => {
    expect(gradeRomaji('kitte', 'きって')).toBe(true);
    expect(gradeRomaji('matcha', 'まっちゃ')).toBe(true);
    expect(gradeRomaji('maccha', 'まっちゃ')).toBe(true);
    expect(gradeRomaji('okaasan', 'おかあさん')).toBe(true);
    expect(gradeRomaji('okāsan', 'おかあさん')).toBe(true);
    expect(gradeRomaji('gakkou', 'がっこう')).toBe(true);
    expect(gradeRomaji('gakkō', 'がっこう')).toBe(true);
    expect(gradeRomaji('ōkii', 'おおきい')).toBe(true);
  });

  it("accepts ん before vowels with or without an apostrophe", () => {
    expect(gradeRomaji("kin'en", 'きんえん')).toBe(true);
    expect(gradeRomaji('kinen', 'きんえん')).toBe(true);
    expect(gradeRomaji('n', 'ん')).toBe(true);
  });

  it('handles katakana long vowels and extended sounds', () => {
    expect(gradeRomaji('koohii', 'コーヒー')).toBe(true);
    expect(gradeRomaji('ko-hi-', 'コーヒー')).toBe(true);
    expect(gradeRomaji('kōhī', 'コーヒー')).toBe(true);
    expect(gradeRomaji('paatii', 'パーティー')).toBe(true);
    expect(gradeRomaji('ti', 'ティ')).toBe(true);
    expect(gradeRomaji('thi', 'ティ')).toBe(true);
    expect(gradeRomaji('di', 'ディ')).toBe(true);
    expect(gradeRomaji('fa', 'ファ')).toBe(true);
    expect(gradeRomaji('vu', 'ヴ')).toBe(true);
    expect(gradeRomaji('tsa', 'ツァ')).toBe(true);
    expect(gradeRomaji('beddo', 'ベッド')).toBe(true);
    expect(gradeRomaji('chi', 'ティ')).toBe(false);
  });
});

describe('gradeKana', () => {
  it('matches kana regardless of script', () => {
    expect(gradeKana('たべる', 'たべる')).toBe(true);
    expect(gradeKana('タベル', 'たべる')).toBe(true);
    expect(gradeKana('こーひー', 'コーヒー')).toBe(true);
    expect(gradeKana('たべた', 'たべる')).toBe(false);
  });
  it('finishes pending romaji such as a trailing n', () => {
    expect(gradeKana('ほn', 'ほん')).toBe(true);
    expect(gradeKana('hon', 'ほん')).toBe(true);
  });
  it('accepts any of several readings', () => {
    expect(gradeKana('わたし', ['わたくし', 'わたし'])).toBe(true);
  });
  it('rejects empty input', () => {
    expect(gradeKana('  ', 'ほん')).toBe(false);
  });
});

describe('gradeMeaning', () => {
  const see = ['to see; to look; to watch; to view', 'to examine; to look over'];
  it('accepts any gloss, with or without "to"', () => {
    expect(gradeMeaning('see', see)).toBe(true);
    expect(gradeMeaning('to watch', see)).toBe(true);
    expect(gradeMeaning('Examine', see)).toBe(true);
  });
  it('ignores parentheses and articles', () => {
    expect(gradeMeaning('cup', ['cup (drinking vessel)'])).toBe(true);
    expect(gradeMeaning('a book', ['book; volume'])).toBe(true);
  });
  it('tolerates small typos on longer words', () => {
    expect(gradeMeaning('elevatr', ['elevator; lift'])).toBe(true);
    expect(gradeMeaning('dog', ['cat'])).toBe(false);
  });
  it('rejects wrong meanings', () => {
    expect(gradeMeaning('eat', see)).toBe(false);
    expect(gradeMeaning('', see)).toBe(false);
  });
});
