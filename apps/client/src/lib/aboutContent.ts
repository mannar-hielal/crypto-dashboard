/**
 * The words of the About page (owner 2026-11-22: "use I", the name Mannar Hielal, the contact
 * info@cryptopapertrade.com). Only things the project or the owner says: no personal history is
 * invented. The first paragraph about the owner is theirs (2026-11-28).
 * The paper-trading limits repeat the landing and How it works pages.
 */

export const ABOUT = {
  title: 'Learn crypto by doing it, without risking a cent.',
  description:
    'cryptopapertrade.com is a free place to learn crypto trading with pretend money on real prices. Who built it, why, and how to reach me.',
  intro:
    'cryptopapertrade.com is a free place to learn crypto trading with pretend money on real prices. Short lessons start from zero, and a live chart lets you try each idea straight away.',
  whyTitle: 'Most people learn trading with real money on the line. That is a bad way to learn.',
  why: 'I wanted a place where a beginner can make a mistake, see what it costs and understand why, before any real money is near. So every lesson ends on the real chart, because seeing an idea work beats reading about it.',
  believeTitle: 'Four promises I keep',
  beliefs: [
    {
      title: 'Learn first, risk nothing',
      text: 'The $10,000 is pretend money. It cannot become real money, and nothing here asks you to deposit any.',
    },
    {
      title: 'Plain words',
      text: 'Every new word is explained the first time you meet it, with an everyday picture.',
    },
    {
      title: 'Honest limits',
      text: 'Practising helps you learn the buttons and the words. It does not prove you would do well with real money, and nothing here is financial advice.',
    },
    {
      title: 'Small on purpose',
      text: 'A modest balance and leverage that stops at 10x, so you practise with the account you would really have.',
    },
  ],
  whoTitle: 'Hi, I am Mannar Hielal.',
  who: [
    'I am a frontend developer, and I live and work in Switzerland. In my free time I am out in nature or inline skating (or both, if there is asphalt :) ).',
    'I am the person behind cryptopapertrade.com, and I look after it myself: what it teaches, how it looks, and what it will never do. There are no ads, and no push to put real money in.',
  ],
  independence:
    "The site is independent. Prices come from Bybit's public market data, and no partnership or endorsement is claimed.",
  contactLead: 'Questions, or something that is not clear? Write to me at',
  email: 'info@cryptopapertrade.com',
  photoAlt: 'Portrait of Mannar Hielal, smiling, in a black shirt',
} as const;
