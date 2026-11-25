import type { WhySlide } from '@/components/landing/WhySlider';
import { WHY_SLIDES } from '@/lib/howItWorksContent';
import phoneAccount from '@/assets/landing/phone-account.webp';
import phoneChart from '@/assets/landing/phone-chart.webp';
import phoneLesson from '@/assets/landing/phone-lesson.webp';
import phonePath from '@/assets/landing/phone-path.webp';
import phoneTrade from '@/assets/landing/phone-trade.webp';

// The Why section's five slides: a real phone capture of the app on each one (decorative, taken on a
// throwaway account, 390 x 844 at 2x, scaled to 540 wide)
const WHY_PICTURES: Record<string, string> = {
  'why-doing': phoneLesson,
  'why-money': phoneAccount,
  'why-prices': phoneChart,
  'why-who': phonePath,
  'why-gets': phoneTrade,
};
const PHONE_SIZE = { width: 540, height: 1169 } as const;

function whyItems(): WhySlide[] {
  return WHY_SLIDES.map((w) => {
    const src = WHY_PICTURES[w.id];
    // A slide without its capture would ship a broken image: fail at load, in the tests, instead
    if (!src) throw new Error(`The Why slide "${w.id}" has no phone capture`);
    return {
      id: w.id,
      title: w.title,
      image: { src, ...PHONE_SIZE },
      bullets: w.bullets,
      note: w.note,
    };
  });
}

export const WHY_ITEMS = whyItems();
