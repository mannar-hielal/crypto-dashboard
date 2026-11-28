import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router';

import { TipSection } from '@/components/TipSection';
import { TIP } from '@/lib/tipContent';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TipSection />
      <Link to={TIP.footerTo}>again</Link>
    </MemoryRouter>
  );
}

describe('TipSection (owner 2026-11-28)', () => {
  afterEach(() => {
    cleanup();
    delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  });

  it('should link the owner’s PayPal.Me page in a new tab, without passing the referrer', () => {
    renderAt('/about');
    const link = screen.getByRole('link', { name: `${TIP.label} (opens in a new tab)` });
    expect(link.getAttribute('href')).toBe('https://paypal.me/mannarhielal');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('should say the tip is voluntary, one-time and unlocks nothing', () => {
    renderAt('/about');
    expect(screen.getByRole('heading', { level: 2, name: TIP.title })).toBeTruthy();
    expect(screen.getByText(TIP.text)).toBeTruthy();
    expect(TIP.text).toMatch(/one-time.*voluntary.*unlocks nothing.*stays free/);
  });

  it('should not move the page without the #fragment', () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    renderAt('/about');
    expect(scroll).not.toHaveBeenCalled();
  });

  it('should scroll to and focus its heading for the footer link, again on a second click', () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    renderAt(TIP.footerTo);
    const heading = screen.getByRole('heading', { level: 2, name: TIP.title });
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(heading);
    fireEvent.click(screen.getByRole('link', { name: 'again' }));
    expect(scroll).toHaveBeenCalledTimes(2);
  });
});
