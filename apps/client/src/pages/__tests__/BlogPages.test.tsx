import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

vi.mock('@/components/SeoHead', () => ({
  SeoHead: ({ title, path, noIndex }: { title: string; path?: string; noIndex?: boolean }) =>
    React.createElement('i', {
      'data-testid': 'seo',
      'data-title': title,
      'data-path': path,
      'data-noindex': noIndex ? 'yes' : 'no',
    }),
}));
vi.mock('@/components/dashboard/TopBar', () => ({ TopBar: () => null }));
vi.mock('@/components/AuthLayout', () => ({
  AuthLayout: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
}));

import { ARTICLES } from '@/blog/posts';
import { BlogIndexPage } from '@/pages/BlogIndexPage';
import { BlogPostPage } from '@/pages/BlogPostPage';
import { ComingSoonPage } from '@/pages/ComingSoonPage';

afterEach(cleanup);

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/blog" element={<BlogIndexPage />} />
        <Route path="/blog/:slug" element={<BlogPostPage />} />
        <Route path="/support" element={<ComingSoonPage page="support" />} />
      </Routes>
    </MemoryRouter>
  );

describe('the Blog (owner 2026-11-18)', () => {
  it('should list every article as a card linking to /blog/<id>, with its reading time', () => {
    renderAt('/blog');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Blog');
    const cards = document.querySelectorAll('[data-guide="blog.card"]');
    expect(cards).toHaveLength(ARTICLES.length);
    for (const article of ARTICLES) {
      const card = document.querySelector(
        `[data-guide="blog.card"][data-guide-key="${article.id}"]`
      )!;
      expect(card.getAttribute('href')).toBe(`/blog/${article.id}`);
      expect(card.textContent).toContain(article.title);
      expect(card.textContent).toContain(`${article.minutes} min read`);
    }
    expect(screen.getByTestId('seo').getAttribute('data-path')).toBe('/blog');
  });

  it('should read every article on its own page: the title, its blocks, a way back and two more', () => {
    for (const article of ARTICLES) {
      renderAt(`/blog/${article.id}`);
      expect(screen.getByRole('heading', { level: 1 }).textContent, article.id).toBe(article.title);
      expect(document.querySelector('[data-guide="blog.back"]')!.getAttribute('href')).toBe(
        '/blog'
      );
      expect(document.querySelectorAll('[data-guide="blog.more"]'), article.id).toHaveLength(2);
      // The more cards are other articles, never this one
      expect(
        document.querySelector(`[data-guide="blog.more"][data-guide-key="${article.id}"]`)
      ).toBeNull();
      expect(screen.getByText('Quick self-test'), article.id).toBeTruthy();
      expect(screen.getByText('Educational content, not financial advice.')).toBeTruthy();
      cleanup();
    }
  });

  it('should send an unknown article back to the Blog', () => {
    renderAt('/blog/not-an-article');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Blog');
  });

  it('should carry no link into a lesson or the learning path', () => {
    for (const article of ARTICLES) {
      renderAt(`/blog/${article.id}`);
      for (const a of document.querySelectorAll('a')) {
        const href = a.getAttribute('href') ?? '';
        expect(
          href.startsWith('/blog') || href.startsWith('https://'),
          `${article.id}: ${href}`
        ).toBe(true);
      }
      cleanup();
    }
  });
});

describe('Support (placeholder)', () => {
  it('should say coming soon, link home, and stay out of search (noindex)', () => {
    for (const [path, title] of [['/support', 'Support']] as const) {
      renderAt(path);
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(title);
      expect(screen.getByText('Coming soon.')).toBeTruthy();
      expect(screen.getByText('Back to home').getAttribute('href')).toBe('/');
      expect(screen.getByTestId('seo').getAttribute('data-noindex')).toBe('yes');
      cleanup();
    }
  });
});
