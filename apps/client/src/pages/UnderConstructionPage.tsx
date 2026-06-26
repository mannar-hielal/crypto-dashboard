import { motion } from 'framer-motion';

import { SeoHead } from '@/components/SeoHead';
import { AuthLayout } from '@/components/AuthLayout';
import { bg, color, gradient } from '@/lib/tokens';

export function UnderConstructionPage() {
  return (
    <>
      <SeoHead
        title="Under Construction"
        description="We are working on something. Check back soon."
        path="/"
        noIndex
      />
      <AuthLayout hideFooter>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="flex flex-col items-center gap-4 text-center"
        >
          {/* Brand mark */}
          <div
            className="h-12 w-12 overflow-hidden rounded-xl"
            style={{
              boxShadow: `0 0 24px ${color.purpleDark}80`,
            }}
          >
            <img src="/logo.svg" alt="CPT" className="h-full w-full" />
          </div>

          <div
            className="rounded-2xl border border-white/8 px-10 py-8 shadow-2xl"
            style={{ background: bg.panel }}
          >
            <h1
              className="text-2xl font-bold"
              style={{
                background: gradient.brand,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Under Construction
            </h1>
            <p className="mt-2 text-sm" style={{ color: color.muted }}>
              We're working on something. Check back soon.
            </p>
          </div>
        </motion.div>
      </AuthLayout>
    </>
  );
}
