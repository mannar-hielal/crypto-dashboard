import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { SiteNav } from '@/components/SiteNav';
import { guideSelector } from '@/lib/guideAnchors';

afterEach(cleanup);

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

const renderNav = (at = '/') =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <SiteNav />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );

const el = <T extends HTMLElement>(anchor: Parameters<typeof guideSelector>[0], key?: string) =>
  document.querySelector<T>(guideSelector(anchor, key))!;

describe('SiteNav (the public pages’ header links)', () => {
  it('should link Blog, About us and Support to their pages (owner 2026-11-18)', () => {
    renderNav();
    expect(el('nav.how').getAttribute('href')).toBe('/how-it-works');
    expect(el('nav.blog').getAttribute('href')).toBe('/blog');
    expect(el('nav.about').getAttribute('href')).toBe('/about');
    expect(el('nav.support').getAttribute('href')).toBe('/support');
  });

  it('should open the Product panel with Chart and Crypto path, and close it on a link', () => {
    renderNav();
    const trigger = el('nav.product');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('#site-nav-product')).toBeNull();
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(el('nav.product.item', 'chart').getAttribute('href')).toBe('/chart');
    expect(el('nav.product.item', 'path').getAttribute('href')).toBe('/path');
    // Chart first, Crypto path second (owner 2026-11-22)
    const items = [...document.querySelectorAll('#site-nav-product a')].map((a) => a.textContent);
    expect(items[0]).toMatch(/^Chart/);
    expect(items[1]).toMatch(/^Crypto path/);
    fireEvent.click(el('nav.product.item', 'path'));
    expect(document.querySelector('#site-nav-product')).toBeNull();
    expect(screen.getByTestId('where').textContent).toBe('/path');
  });

  it('should close the Product panel on Esc, giving the focus back, and on a press outside', () => {
    renderNav();
    const trigger = el('nav.product');
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('#site-nav-product')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(document.querySelector('#site-nav-product')).toBeNull();
  });

  it('should mark the page you are on, the Blog for an article too', () => {
    renderNav('/blog/suncoin');
    expect(el('nav.blog').getAttribute('aria-current')).toBe('page');
    expect(el('nav.about').getAttribute('aria-current')).toBeNull();
    cleanup();
    renderNav('/support');
    expect(el('nav.support').getAttribute('aria-current')).toBe('page');
    expect(el('nav.blog').getAttribute('aria-current')).toBeNull();
  });

  it('should open a phone menu sheet with the same links, Product expanding to Chart and Crypto path', () => {
    renderNav();
    const button = el('nav.menu');
    expect(el('nav.menu.sheet')).toBeNull();
    fireEvent.click(button);
    const sheet = el('nav.menu.sheet');
    expect(sheet).not.toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(sheet.querySelector(guideSelector('nav.product.item', 'chart'))).toBeNull();
    fireEvent.click(sheet.querySelector(guideSelector('nav.product'))!);
    expect(sheet.querySelector(guideSelector('nav.product.item', 'chart'))).not.toBeNull();
    expect(sheet.querySelector(guideSelector('nav.blog'))!.getAttribute('href')).toBe('/blog');
    // A link closes the sheet
    fireEvent.click(sheet.querySelector(guideSelector('nav.about'))!);
    expect(el('nav.menu.sheet')).toBeNull();
    expect(screen.getByTestId('where').textContent).toBe('/about');
  });

  it('should close the phone sheet on Esc and give the focus back to the menu button', () => {
    renderNav();
    const button = el('nav.menu');
    fireEvent.click(button);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(el('nav.menu.sheet')).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});
