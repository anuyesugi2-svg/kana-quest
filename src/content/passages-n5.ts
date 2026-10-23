// Short N5 reading passages, written by hand using N5 grammar and vocabulary.
// (Single-sentence reading practice comes from Tatoeba; see tools/build_data.py.)

import type { Passage } from '../core/types';

export const PASSAGES_N5: Passage[] = [
  {
    id: 'self-intro',
    title: 'はじめまして',
    lines: [
      { jp: 'はじめまして。', en: 'Nice to meet you.' },
      { jp: '[私|わたし]_は アンナ です。', en: 'I’m Anna.' },
      { jp: 'アメリカ から [来|き]ました。', en: 'I came from America.' },
      { jp: '[大学|だいがく]の [学生|がくせい] です。', en: 'I’m a university student.' },
      { jp: '[毎日|まいにち] [日本語|にほんご]_を [勉強|べんきょう]して います。', en: 'I study Japanese every day.' },
      { jp: 'すし が [好|す]き です。', en: 'I like sushi.' },
      { jp: 'どうぞ よろしく おねがいします。', en: 'Pleased to meet you.' },
    ],
    questions: [
      { q: 'Where is Anna from?', options: ['America', 'Japan', 'England', 'China'], answer: 'America' },
      { q: 'What does Anna do?', options: ['She’s a university student.', 'She’s a teacher.', 'She’s a doctor.', 'She’s a high-school student.'], answer: 'She’s a university student.' },
      { q: 'What does Anna like?', options: ['Sushi', 'Ramen', 'Tea', 'Movies'], answer: 'Sushi' },
    ],
  },
  {
    id: 'my-day',
    title: '[私|わたし]の [一日|いちにち]',
    lines: [
      { jp: '[私|わたし]_は [毎朝|まいあさ] [七時|しちじ]に [起|お]きます。', en: 'I get up at seven every morning.' },
      { jp: 'パン_を [食|た]べて、コーヒー_を [飲|の]みます。', en: 'I eat bread and drink coffee.' },
      { jp: '[八時|はちじ]に [電車|でんしゃ] で [会社|かいしゃ]に [行|い]きます。', en: 'At eight I go to the office by train.' },
      { jp: '[九時|くじ]から [五時|ごじ]まで [働|はたら]きます。', en: 'I work from nine to five.' },
      { jp: '[夜|よる]_は うち で [本|ほん]_を [読|よ]みます。', en: 'In the evening I read books at home.' },
      { jp: '[十一時|じゅういちじ]に [寝|ね]ます。', en: 'I go to bed at eleven.' },
    ],
    questions: [
      { q: 'What time does the writer get up?', options: ['7:00', '8:00', '9:00', '11:00'], answer: '7:00' },
      { q: 'How does the writer get to work?', options: ['By train', 'By bus', 'On foot', 'By car'], answer: 'By train' },
      { q: 'What does the writer do in the evening?', options: ['Reads books at home', 'Watches TV', 'Studies at the library', 'Goes jogging'], answer: 'Reads books at home' },
    ],
  },
  {
    id: 'weekend',
    title: '[週末|しゅうまつ]',
    lines: [
      { jp: '[土曜日|どようび]に [友|とも]だち_と [公園|こうえん]に [行|い]きました。', en: 'On Saturday I went to the park with a friend.' },
      { jp: '[天気|てんき]が よかった です。', en: 'The weather was good.' },
      { jp: '[公園|こうえん]に_は [花|はな]が たくさん ありました。', en: 'There were lots of flowers in the park.' },
      { jp: 'そこ で おべんとう_を [食|た]べました。', en: 'We ate boxed lunches there.' },
      { jp: '[日曜日|にちようび]_は [雨|あめ] でした から、どこ にも [行|い]きません でした。', en: 'On Sunday it rained, so I didn’t go anywhere.' },
      { jp: 'うち で [映画|えいが]_を [見|み]ました。', en: 'I watched a movie at home.' },
    ],
    questions: [
      { q: 'Who did the writer go to the park with?', options: ['A friend', 'Family', 'A teacher', 'Nobody'], answer: 'A friend' },
      { q: 'What was the weather like on Sunday?', options: ['Rainy', 'Sunny', 'Snowy', 'Windy'], answer: 'Rainy' },
      { q: 'What did the writer do on Sunday?', options: ['Watched a movie at home', 'Went to the park', 'Ate at a restaurant', 'Went shopping'], answer: 'Watched a movie at home' },
    ],
  },
  {
    id: 'shopping',
    title: 'かいもの',
    lines: [
      { jp: 'きのう デパート へ かいもの に [行|い]きました。', en: 'Yesterday I went shopping at a department store.' },
      { jp: '[新|あたら]しい くつ が ほしかった です。', en: 'I wanted new shoes.' },
      { jp: '[赤|あか]い くつ_は [高|たか]かった です から、[買|か]いません でした。', en: 'The red shoes were expensive, so I didn’t buy them.' },
      { jp: '[白|しろ]い くつ_は [安|やす]くて、とても よかった です。', en: 'The white shoes were cheap and very nice.' },
      { jp: '[白|しろ]い くつ_を [買|か]いました。', en: 'I bought the white shoes.' },
    ],
    questions: [
      { q: 'What did the writer want?', options: ['New shoes', 'A new bag', 'A red shirt', 'A white hat'], answer: 'New shoes' },
      { q: 'Why didn’t the writer buy the red shoes?', options: ['They were expensive.', 'They were too small.', 'They were ugly.', 'The shop was closed.'], answer: 'They were expensive.' },
      { q: 'What did the writer buy?', options: ['White shoes', 'Red shoes', 'Nothing', 'Both pairs'], answer: 'White shoes' },
    ],
  },
];
