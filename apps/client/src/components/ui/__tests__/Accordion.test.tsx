import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

import { Accordion } from '../Accordion';

const ITEMS = [
  { id: 'a', question: 'First?', content: React.createElement('p', null, 'Answer one') },
  { id: 'b', question: 'Second?', content: React.createElement('p', null, 'Answer two') },
  { id: 'c', question: 'Third?', content: React.createElement('p', null, 'Answer three') },
];

describe('Accordion', () => {
  afterEach(cleanup);

  it('should render each question as a button inside a heading, closed by default', () => {
    render(React.createElement(Accordion, { items: ITEMS }));
    const first = screen.getByRole('button', { name: 'First?' });
    expect(first.closest('h3')).not.toBeNull();
    expect(first.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('Answer one').closest('[role="region"]')?.hasAttribute('hidden')).toBe(
      true
    );
  });

  it('should link each button to its panel with aria-controls and aria-labelledby', () => {
    render(React.createElement(Accordion, { items: ITEMS, defaultOpen: ['a'] }));
    const button = screen.getByRole('button', { name: 'First?' });
    const panel = screen.getByRole('region', { name: 'First?' });
    expect(button.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(button.id);
  });

  it('should toggle a row on click and keep the others as they were', () => {
    render(React.createElement(Accordion, { items: ITEMS, defaultOpen: ['b'] }));
    const first = screen.getByRole('button', { name: 'First?' });
    fireEvent.click(first);
    expect(first.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Answer one').closest('[role="region"]')?.hasAttribute('hidden')).toBe(
      false
    );
    expect(screen.getByRole('button', { name: 'Second?' }).getAttribute('aria-expanded')).toBe(
      'true'
    );
    fireEvent.click(first);
    expect(first.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('Answer one').closest('[role="region"]')?.hasAttribute('hidden')).toBe(
      true
    );
  });

  it('should move focus with the arrow keys, Home and End, wrapping around', () => {
    render(React.createElement(Accordion, { items: ITEMS }));
    const [a, b, c] = ['First?', 'Second?', 'Third?'].map((n) =>
      screen.getByRole('button', { name: n })
    ) as [HTMLElement, HTMLElement, HTMLElement];
    a.focus();
    fireEvent.keyDown(a, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(b);
    fireEvent.keyDown(b, { key: 'End' });
    expect(document.activeElement).toBe(c);
    fireEvent.keyDown(c, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(a);
    fireEvent.keyDown(a, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(c);
    fireEvent.keyDown(c, { key: 'Home' });
    expect(document.activeElement).toBe(a);
  });

  it('should use the heading level it is given', () => {
    render(React.createElement(Accordion, { items: ITEMS, headingLevel: 4 }));
    expect(screen.getByRole('button', { name: 'First?' }).closest('h4')).not.toBeNull();
  });
});
