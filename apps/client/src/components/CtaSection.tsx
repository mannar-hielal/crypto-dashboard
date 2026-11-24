import { motion, type Variants } from 'framer-motion';
import { Link } from 'react-router';
import ctaIllustration from '@/assets/cta-illustration.svg';
import { Button } from '@/components/ui/button';
import { NewsletterForm } from '@/components/NewsletterForm';
import { color, gradient } from '@/lib/tokens';

const isLive = import.meta.env.VITE_IS_LIVE === 'true';

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' },
  },
};

/**
 * The closing call to action. `newsletterOnly` (the How it works page, owner 2026-11-24) always shows the
 * e-mail sign-up for the latest updates, even after launch, instead of the account button.
 */
export function CtaSection({ newsletterOnly = false }: { newsletterOnly?: boolean }) {
  return (
    <div id="newsletter" className="relative w-full">
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
          loading="lazy"
          // Faint on a phone, on every page that shows this section: the coins sat on the words (sweep 2026-11-24)
          className="h-full w-full object-contain opacity-30 sm:opacity-100"
          style={{ maxWidth: '1200px' }}
        />
      </div>

      <motion.div
        variants={itemVariants}
        className="relative mx-auto flex max-w-2xl flex-col items-center gap-8 px-8 py-20 text-center sm:py-24"
      >
        {isLive && !newsletterOnly ? (
          <div className="relative z-10 flex max-w-lg flex-col items-center gap-5">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              Ready to trade? Create your free account
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: color.muted }}>
              No credit card. No risk. Just real-time data and a virtual $10K to practice with.
            </p>
            <Button
              asChild
              size="lg"
              className="h-12 rounded-full px-10 text-base font-semibold text-white shadow-lg"
              style={{ background: gradient.brand }}
            >
              <Link to="/register">Create Free Account</Link>
            </Button>
          </div>
        ) : (
          <div className="relative z-10 flex max-w-lg flex-col items-center gap-5">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              {isLive ? 'Get the latest updates' : 'Launching soon. Be the first to know.'}
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: color.muted }}>
              {isLive
                ? 'New lessons and new features, now and then. One short e-mail, nothing else.'
                : "No spam, unsubscribe anytime. We'll notify you when we go live."}
            </p>
            <NewsletterForm />
          </div>
        )}
      </motion.div>
    </div>
  );
}
