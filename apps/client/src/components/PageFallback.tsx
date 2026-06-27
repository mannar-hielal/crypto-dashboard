import { Loader2 } from 'lucide-react';
import { bg, color } from '@/lib/tokens';

export function PageFallback() {
  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{
        background: `linear-gradient(180deg, ${bg.deep} 0%, ${bg.page} 30%, ${bg.navy} 100%)`,
      }}
    >
      <Loader2 className="h-8 w-8 animate-spin" style={{ color: color.purple }} />
    </div>
  );
}
