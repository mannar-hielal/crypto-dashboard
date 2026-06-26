import { motion, type Variants } from 'framer-motion';
import { Link } from 'react-router';
import ctaIllustration from '@/assets/cta-illustration.svg';
import { Button } from '@/components/ui/button';
import { color, gradient } from '@/lib/tokens';

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' },
  },
};

export function CtaSection() {
  return (
    <div className="relative w-full">
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-center"
        style={{
          height: '340px',
          maskImage:
            'linear-gradient(to bottom, transparent 0%, black 25%, black 75%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(to bottom, transparent 0%, black 25%, black 75%, transparent 100%)',
        }}
      >
        <img
          src={ctaIllustration}
          alt=""
          className="h-full w-full object-contain opacity-70"
          style={{ maxWidth: '1200px' }}
        />
      </div>

      <motion.div
        variants={itemVariants}
        className="relative mx-auto flex max-w-2xl flex-col items-center gap-8 px-8 py-20 text-center sm:py-24"
      >
        <div className="relative z-10 flex max-w-lg flex-col items-center gap-5">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">Start trading in 20 seconds</h2>
          <p className="text-sm leading-relaxed" style={{ color: color.muted }}>
            No credit card. No risk. Just real-time data and a virtual $10K to practice with.
          </p>
          <Button
            asChild
            size="lg"
            className="h-12 rounded-full px-10 text-base font-semibold text-white shadow-lg"
            style={{ background: gradient.brand }}
          >
            <Link to="/register">Get Started Free</Link>
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
