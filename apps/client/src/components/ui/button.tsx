import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';

import { cn } from '@/lib/utils';
import styles from './Button.module.css';

// ─── Constants ────────────────────────────────────────────────────────────────

const VARIANT_MAP: Record<string, string> = {
  default: styles.default,
  outline: styles.outline,
  secondary: styles.secondary,
  ghost: styles.ghost,
  destructive: styles.destructive,
  link: styles.link,
  primary: styles.primary,
  danger: styles.danger,
};

const SIZE_MAP: Record<string, string> = {
  default: styles.sm,
  xs: styles.xs,
  sm: styles.sm,
  md: styles.md,
  lg: styles.lg,
  icon: styles.icon,
  'icon-xs': styles.iconXs,
  'icon-sm': styles.iconSm,
  'icon-lg': styles.iconLg,
};

// ─── CVA for backward-compat API (still exported so consumers can use
//      `buttonVariants()` directly if they choose) ───────────────────────────

const buttonVariants = cva(styles.button, {
  variants: {
    variant: Object.fromEntries(Object.entries(VARIANT_MAP).map(([k, v]) => [k, v])),
    size: Object.fromEntries(Object.entries(SIZE_MAP).map(([k, v]) => [k, v])),
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

// ─── Component ────────────────────────────────────────────────────────────────

interface ButtonProps extends React.ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  active?: boolean;
}

function Button({
  className,
  variant = 'default',
  size = 'default',
  active = false,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-active={active || undefined}
      className={cn(buttonVariants({ variant, size }), active && styles.active, className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
