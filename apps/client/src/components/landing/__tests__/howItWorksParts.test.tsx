import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within, act } from '@testing-library/react';

import {
  HALVES,
  STACK,
  STACK_LINKS,
  STACK_TECH,
  TOURS,
  WORDS_PICTURED,
} from '@/lib/howItWorksContent';
import { WhySlider } from '../WhySlider';
import { PictureCallouts } from '../PictureCallouts';
import { StackDiagram } from '../StackDiagram';
import { TourPlayer } from '../TourPlayer';

afterEach(cleanup);

const img = { src: '/x.webp', width: 10, height: 10 };
const slides = [
  { id: 'a', title: 'First', image: img, bullets: [{ lead: 'One' }], note: 'A note' },
  { id: 'b', title: 'Second', image: img, bullets: [{ lead: 'Two', text: 'more' }] },
  { id: 'c', title: 'Third', image: img, bullets: [{ lead: 'Three' }] },
];

describe('WhySlider', () => {
  const dots = () =>
    within(screen.getByRole('list', { name: 'Pick a reason' })).getAllByRole('button');

  it('should start on the first slide with every slide’s text in the page', () => {
    render(<WhySlider slides={slides} />);
    expect(screen.getByText('One')).not.toBeNull();
    expect(screen.getByText('Two')).not.toBeNull();
    expect(screen.getByText('A note')).not.toBeNull();
    expect(dots()[0]?.getAttribute('aria-current')).toBe('true');
    expect(
      screen.getByRole('button', { name: 'Previous reason' }).getAttribute('aria-disabled')
    ).toBe('true');
  });

  it('should hide the slides that are not showing from a screen reader (inert)', () => {
    const { container } = render(<WhySlider slides={slides} />);
    const sections = [...container.querySelectorAll('section')];
    expect(sections.map((s) => s.hasAttribute('inert'))).toEqual([false, true, true]);
  });

  it('should move with the arrows, the dots and the keyboard, and stop at the ends', () => {
    const { container } = render(<WhySlider slides={slides} />);
    const region = container.firstElementChild as HTMLElement;
    fireEvent.click(screen.getByRole('button', { name: 'Next reason' }));
    expect(dots()[1]?.getAttribute('aria-current')).toBe('true');
    fireEvent.click(dots()[2]!);
    expect(dots()[2]?.getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('button', { name: 'Next reason' }).getAttribute('aria-disabled')).toBe(
      'true'
    );
    fireEvent.keyDown(region, { key: 'ArrowUp' });
    expect(dots()[1]?.getAttribute('aria-current')).toBe('true');
    fireEvent.keyDown(region, { key: 'Home' });
    expect(dots()[0]?.getAttribute('aria-current')).toBe('true');
    fireEvent.keyDown(region, { key: 'End' });
    expect(dots()[2]?.getAttribute('aria-current')).toBe('true');
  });

  it('should change slide on a wheel flick, and let the page scroll at the ends', () => {
    const { container } = render(<WhySlider slides={slides} />);
    const stage = container.querySelector('section')!.parentElement!.parentElement as HTMLElement;
    // On the first slide, scrolling up belongs to the page: not prevented
    const up = new WheelEvent('wheel', { deltaY: -80, bubbles: true, cancelable: true });
    stage.dispatchEvent(up);
    expect(up.defaultPrevented).toBe(false);
    // Scrolling down takes the slider on
    const down = new WheelEvent('wheel', { deltaY: 80, bubbles: true, cancelable: true });
    act(() => {
      stage.dispatchEvent(down);
    });
    expect(down.defaultPrevented).toBe(true);
    expect(dots()[1]?.getAttribute('aria-current')).toBe('true');
  });

  it('should change slide when a mouse drags up, and back when it drags down', () => {
    const { container } = render(<WhySlider slides={slides} />);
    const stage = container.querySelector('section')!.parentElement!.parentElement as HTMLElement;
    stage.setPointerCapture = vi.fn();
    const ptr = (type: string, clientY: number) =>
      fireEvent(
        stage,
        Object.assign(new MouseEvent(type, { bubbles: true, clientY }), {
          pointerType: 'mouse',
          pointerId: 1,
        })
      );
    ptr('pointerdown', 300);
    ptr('pointermove', 220);
    expect(dots()[1]?.getAttribute('aria-current')).toBe('true');
    ptr('pointerdown', 220);
    ptr('pointermove', 300);
    expect(dots()[0]?.getAttribute('aria-current')).toBe('true');
  });

  it('should give neighbouring slides different colours, cycling through five', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      ...slides[0]!,
      id: `r${i}`,
      title: `R${i}`,
    }));
    const { container } = render(<WhySlider slides={many} />);
    const tones = [...container.querySelectorAll('section')].map(
      (r) => /tone\d/.exec(r.className)?.[0]
    );
    expect(new Set(tones.slice(0, 5)).size).toBe(5);
    expect(tones[5]).toBe(tones[0]);
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

  it('should keep every tour zoom sorted, inside the frame and not overlapping the next one', () => {
    for (const t of TOURS) {
      expect(t.zoom.length).toBeGreaterThan(0);
      t.zoom.forEach((z, i) => {
        expect(z.at).toBeGreaterThanOrEqual(0);
        expect(z.x).toBeGreaterThanOrEqual(0);
        expect(z.x).toBeLessThanOrEqual(1);
        expect(z.y).toBeGreaterThanOrEqual(0);
        expect(z.y).toBeLessThanOrEqual(1);
        const next = t.zoom[i + 1];
        if (next) expect(z.at + (z.hold ?? 1.4)).toBeLessThanOrEqual(next.at + 1e-9);
      });
    }
  });

  it('should zoom the clip in on a click while it plays and out again after', () => {
    vi.stubGlobal('matchMedia', undefined);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    try {
      const { container } = render(<TourPlayer />);
      const video = container.querySelector('video') as HTMLVideoElement;
      const z = TOURS[0].zoom[0];
      fireEvent.play(video);
      const run = (t: number) => {
        Object.defineProperty(video, 'currentTime', { value: t, configurable: true });
        const due = frames.splice(0);
        act(() => due.forEach((cb) => cb(0)));
      };
      run(z.at + 0.1);
      // Panned to put the spot mid-view (clamped to the clip's edge), then zoomed
      expect(video.style.transform).toMatch(/^translate\(-?[\d.]+%, -?[\d.]+%\) scale\(1\.8\)$/);
      run(z.at + 3);
      expect(video.style.transform).toBe('');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('should mix desktop and phone tours', () => {
    expect(TOURS.some((t) => t.device === 'phone')).toBe(true);
    expect(TOURS.some((t) => t.device === 'desktop')).toBe(true);
  });
});

describe('the stack picture’s tech tiles', () => {
  it('should show every layer’s tools by name', () => {
    render(<StackDiagram />);
    for (const names of Object.values(STACK_TECH)) {
      for (const n of names) expect(screen.getAllByText(n).length).toBeGreaterThan(0);
    }
    // Every tile has a drawn mark, never an empty icon
    for (const svg of document.querySelectorAll('ul[aria-label="Built with"] svg')) {
      expect(svg.childElementCount).toBeGreaterThan(0);
    }
    // One "Built with" row for each of the four layers
    expect(screen.getAllByRole('list', { name: 'Built with' })).toHaveLength(STACK.length);
  });

  it('should send the price road upward only: one arrow, dashes streaming up', () => {
    const { container } = render(<StackDiagram />);
    const up = container.querySelector('[aria-label="Between the live price feed and the server"]');
    expect(up?.className).toMatch(/linkUp/);
    const down = container.querySelector('[aria-label="Between the server and the database"]');
    expect(down?.className).not.toMatch(/linkUp/);
  });
});

describe('WhySlider touch', () => {
  const touch = (target: Element, type: string, y: number, count = 1) => {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(e, {
      touches: Array.from({ length: count }, () => ({ clientX: 0, clientY: y })),
    });
    act(() => {
      target.dispatchEvent(e);
    });
    return e;
  };
  const stageOf = (c: HTMLElement) => c.querySelector('section')!.parentElement!.parentElement!;

  it('should keep the rest of a swipe once it has moved a slide, so the page never follows it', () => {
    const { container } = render(<WhySlider slides={slides} />);
    const stage = stageOf(container);
    touch(stage, 'touchstart', 400);
    expect(touch(stage, 'touchmove', 300).defaultPrevented).toBe(true); // moves slide 1 -> 2
    touch(stage, 'touchmove', 200); // the finger carries on
    touch(stage, 'touchstart', 400);
    touch(stage, 'touchmove', 300); // slide 2 -> 3, the last
    const tail = touch(stage, 'touchmove', 100);
    expect(tail.defaultPrevented).toBe(true);
  });

  it('should ignore a two-finger pinch', () => {
    const { container } = render(<WhySlider slides={slides} />);
    const stage = stageOf(container);
    touch(stage, 'touchstart', 400, 2);
    expect(touch(stage, 'touchmove', 200, 2).defaultPrevented).toBe(false);
  });

  it('should let the page scroll when swiping up on the last slide', () => {
    const { container } = render(<WhySlider slides={slides} />);
    fireEvent.keyDown(container.firstElementChild!, { key: 'End' });
    const stage = stageOf(container);
    touch(stage, 'touchstart', 400);
    expect(touch(stage, 'touchmove', 300).defaultPrevented).toBe(false);
  });
});

describe('LessonArt center', () => {
  it('should slide the view so the drawing sits in the middle of the card', async () => {
    const { LessonArt } = await import('@/guide/LessonArt');
    // A drawing whose box runs from x 100 to 300: its centre is 200, so the view moves 40 to the right
    const getBBox = vi.fn(() => ({ x: 100, y: 0, width: 200, height: 100 }));
    Object.defineProperty(SVGElement.prototype, 'getBBox', { configurable: true, value: getBBox });
    try {
      const { container } = render(<LessonArt id="threePaths" center />);
      expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('40 0 320 160');
      cleanup();
      const plain = render(<LessonArt id="threePaths" />);
      expect(plain.container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 320 160');
    } finally {
      Reflect.deleteProperty(SVGElement.prototype, 'getBBox');
    }
  });
});
