import { describe, expect, it } from 'vitest';
import { expandChoonpu, hiraToKata, kanaToRomaji, kataToHira, normalizeKana } from '../src/core/romaji';

describe('kanaToRomaji (Hepburn)', () => {
  it.each([
    ['あいうえお', 'aiueo'],
    ['しちつふじ', 'shichitsufuji'],
    ['ぢづ', 'jizu'],
    ['を', 'wo'],
    ['きゃきゅきょ', 'kyakyukyo'],
    ['しゃしゅしょ', 'shashusho'],
    ['ちゃちゅちょ', 'chachucho'],
    ['じゃじゅじょ', 'jajujo'],
    ['ぴゃ', 'pya'],
    ['きって', 'kitte'],
    ['まっちゃ', 'matcha'],
    ['ざっし', 'zasshi'],
    ['がっこう', 'gakkou'],
    ['おかあさん', 'okaasan'],
    ['せんせい', 'sensei'],
    ['きんえん', "kin'en"],
    ['こんや', "kon'ya"],
    ['ほん', 'hon'],
  ])('%s -> %s', (kana, roma) => {
    expect(kanaToRomaji(kana)).toBe(roma);
  });

  it.each([
    ['コーヒー', 'koohii'],
    ['パーティー', 'paatii'],
    ['ファ', 'fa'],
    ['ティ', 'ti'],
    ['ディ', 'di'],
    ['トゥ', 'tu'],
    ['ウィ', 'wi'],
    ['ウォ', 'wo'],
    ['ヴァ', 'va'],
    ['ヴ', 'vu'],
    ['シェ', 'she'],
    ['ジェ', 'je'],
    ['チェ', 'che'],
    ['ツァ', 'tsa'],
    ['デュ', 'dyu'],
    ['ベッド', 'beddo'],
    ['ベートーヴェン', 'beetooven'],
  ])('katakana %s -> %s', (kana, roma) => {
    expect(kanaToRomaji(kana)).toBe(roma);
  });

  it('reads marked particles as wa/e/o', () => {
    expect(kanaToRomaji('は', new Set([0]))).toBe('wa');
    expect(kanaToRomaji('へ', new Set([0]))).toBe('e');
    expect(kanaToRomaji('を', new Set([0]))).toBe('o');
  });

  it('converts punctuation and full-width digits', () => {
    expect(kanaToRomaji('はい。')).toBe('hai.');
    expect(kanaToRomaji('２')).toBe('2');
  });
});

describe('script helpers', () => {
  it('converts between scripts', () => {
    expect(kataToHira('カタカナ')).toBe('かたかな');
    expect(hiraToKata('ひらがな')).toBe('ヒラガナ');
    expect(kataToHira('ヴ')).toBe('ゔ');
  });
  it('expands the long-vowel mark', () => {
    expect(expandChoonpu('こーひー')).toBe('こおひい');
    expect(normalizeKana('パーティー')).toBe(normalizeKana('ぱあてぃい'));
  });
});
