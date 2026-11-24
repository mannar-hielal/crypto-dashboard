import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within, act } from '@testing-library/react';

import { HALVES, STACK, STACK_LINKS, TOURS, WORDS_PICTURED } from '@/lib/howItWorksContent';
import { PictureAccordion } from '../PictureAccordion';
import { PictureCallouts } from '../PictureCallouts';
import { StackDiagram } from '../StackDiagram';
import { TourPlayer } from '../TourPlayer';

afterEach(cleanup);

const img = { src: '/x.webp', width: 10, height: 10 };
const items = [
  { id: 'a', title: 'First', image: img, body: <p>Body one</p> },
  { id: 'b', title: 'Second', image: img, body: <p>Body two</p> },
  { id: 'c', title: 'Third', image: img, body: <p>Body three</p> },
];

describe('PictureAccordion', () => {
  it('should open the first panel and keep every panel text in the page', () => {
    render(<PictureAccordion items={items} />);
    expect(screen.getByRole('button', { name: /First/ }).getAttribute('aria-expanded')).toBe(
      'true'
    );
    expect(screen.getByRole('button', { name: /Second/ }).getAttribute('aria-expanded')).toBe(
      'false'
    );
    expect(screen.getByText('Body two')).not.toBeNull();
  });

  it('should open a panel on click and close the one before it', () => {
    render(<PictureAccordion items={items} />);
    fireEvent.click(screen.getByRole('button', { name: /Third/ }));
    expect(screen.getByRole('button', { name: /Third/ }).getAttribute('aria-expanded')).toBe(
      'true'
    );
    expect(screen.getByRole('button', { name: /First/ }).getAttribute('aria-expanded')).toBe(
      'false'
    );
  });

  it('should open a panel on mouse hover after a short pause, but not on touch', () => {
    vi.useFakeTimers();
    const { container } = render(<PictureAccordion items={items} />);
    const rows = container.querySelectorAll('[data-open]');
    fireEvent.pointerEnter(rows[1], { pointerType: 'touch' });
    act(() => vi.advanceTimersByTime(500));
    expect(rows[1].getAttribute('data-open')).toBe('false');
    fireEvent.pointerEnter(rows[1], { pointerType: 'mouse' });
    expect(rows[1].getAttribute('data-open')).toBe('false');
    act(() => vi.advanceTimersByTime(200));
    expect(rows[1].getAttribute('data-open')).toBe('true');
    vi.useRealTimers();
  });

  it('should not open a panel the pointer only passed over', () => {
    vi.useFakeTimers();
    const { container } = render(<PictureAccordion items={items} />);
    const rows = container.querySelectorAll('[data-open]');
    fireEvent.pointerEnter(rows[2], { pointerType: 'mouse' });
    fireEvent.pointerLeave(rows[2]);
    act(() => vi.advanceTimersByTime(500));
    expect(rows[2].getAttribute('data-open')).toBe('false');
    vi.useRealTimers();
  });

  it('should move between panels with the arrow keys', () => {
    render(<PictureAccordion items={items} />);
    const first = screen.getByRole('button', { name: /First/ });
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: /Second/ }).getAttribute('aria-expanded')).toBe(
      'true'
    );
    fireEvent.keyDown(screen.getByRole('button', { name: /Second/ }), { key: 'End' });
    expect(screen.getByRole('button', { name: /Third/ }).getAttribute('aria-expanded')).toBe(
      'true'
    );
  });
});

describe('PictureAccordion focus', () => {
  it('should not open a panel when focus only reaches its heading (Tab)', () => {
    render(<PictureAccordion items={items} />);
    const second = screen.getByRole('button', { name: /Second/ });
    fireEvent.focus(second);
    expect(second.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('button', { name: /First/ }).getAttribute('aria-expanded')).toBe(
      'true'
    );
    fireEvent.click(second);
    expect(second.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('PictureCallouts', () => {
  it('should show both post-its with their points', () => {
    render(<PictureCallouts learn={HALVES[0]} chart={HALVES[1]} alt="The lesson over the chart" />);
    expect(screen.getByRole('heading', { name: 'The learning path' })).not.toBeNull();
    expect(
      screen.getByRole('heading', { name: 'The live chart and practice desk' })
    ).not.toBeNull();
    for (const p of [...HALVES[0].points, ...HALVES[1].points]) {
      expect(screen.getByText(p)).not.toBeNull();
    }
    expect(screen.getByAltText('The lesson over the chart')).not.toBeNull();
  });
});

describe('StackDiagram', () => {
  it('should draw the four layers in order, each with what it does and what is missing without it', () => {
    render(<StackDiagram />);
    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    for (const l of STACK) expect(titles).toContain(l.title);
    expect(screen.getAllByText('Does')).toHaveLength(4);
    expect(screen.getAllByText('Without it')).toHaveLength(4);
  });

  it('should find every word card the layers and roads name', () => {
    for (const t of [...STACK.flatMap((l) => l.words), ...STACK_LINKS]) {
      expect(
        WORDS_PICTURED.some((w) => w.title === t),
        t
      ).toBe(true);
    }
  });

  it('should place every word picture on a layer or a road, none left out', () => {
    render(<StackDiagram />);
    for (const w of WORDS_PICTURED) {
      expect(screen.getAllByText(w.title).length, w.title).toBeGreaterThan(0);
    }
  });

  it('should end on the quick guide naming the four parts', () => {
    render(<StackDiagram />);
    const guide = screen.getByLabelText('The four parts in one line');
    for (const l of STACK) expect(within(guide).getByText(l.title)).not.toBeNull();
  });
});

describe('TourPlayer clip state', () => {
  it('should show Play, not Pause, when another tour opens after a clip was playing', () => {
    const { container } = render(<TourPlayer />);
    const video = container.querySelector('video') as HTMLVideoElement;
    fireEvent.play(video);
    expect(screen.getByText('Pause the clip')).not.toBeNull();
    fireEvent.click(screen.getAllByRole('tab')[1]);
    expect(screen.queryByText('Pause the clip')).toBeNull();
    expect(screen.getByText('Play the clip')).not.toBeNull();
  });
});

describe('TourPlayer', () => {
  it('should list the five tours as tabs and open the first one', () => {
    render(<TourPlayer />);
    expect(screen.getAllByRole('tab')).toHaveLength(5);
    expect(TOURS).toHaveLength(5);
    expect(screen.getAllByRole('tab')[0].getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('heading', { name: TOURS[0].title })).not.toBeNull();
  });

  it('should switch the tour and its steps when a tab is picked', () => {
    render(<TourPlayer />);
    fireEvent.click(screen.getAllByRole('tab')[2]);
    expect(screen.getByRole('heading', { name: TOURS[2].title })).not.toBeNull();
    for (const s of TOURS[2].steps) expect(screen.getByText(s)).not.toBeNull();
    expect(screen.getByText('On a phone')).not.toBeNull();
  });

  it('should move between the tabs with the arrow keys, one tab stop at a time', () => {
    render(<TourPlayer />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1', '-1']);
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(screen.getAllByRole('tab')[1].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(screen.getAllByRole('tab')[1], { key: 'ArrowLeft' });
    fireEvent.keyDown(screen.getAllByRole('tab')[0], { key: 'ArrowLeft' });
    expect(screen.getAllByRole('tab')[4].getAttribute('aria-selected')).toBe('true');
  });

  it('should mix desktop and phone tours', () => {
    expect(TOURS.some((t) => t.device === 'phone')).toBe(true);
    expect(TOURS.some((t) => t.device === 'desktop')).toBe(true);
  });
});
