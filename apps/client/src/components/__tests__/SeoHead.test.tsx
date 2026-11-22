import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router';

import { SeoHead } from '../SeoHead';

function renderSeo(props: React.ComponentProps<typeof SeoHead>) {
  return render(
    React.createElement(
      HelmetProvider,
      null,
      React.createElement(MemoryRouter, null, React.createElement(SeoHead, props))
    )
  );
}

describe('SeoHead', () => {
  afterEach(cleanup);

  it('should write the title, description and canonical when rendered', async () => {
    renderSeo({ title: 'Hello', description: 'A page', path: '/how-it-works' });
    await waitFor(() => expect(document.title).toBe('Hello | cryptopapertrade.com'));
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toMatch(
      /\/how-it-works$/
    );
  });

  it('should write a JSON-LD block and escape a closing tag when jsonLd is given', async () => {
    renderSeo({
      title: 'Faq',
      description: 'Questions',
      path: '/how-it-works',
      jsonLd: { '@type': 'FAQPage', name: '</script><b>x & y\u2028z' },
    });
    await waitFor(() =>
      expect(document.querySelector('script[type="application/ld+json"]')).not.toBeNull()
    );
    const text = document.querySelector('script[type="application/ld+json"]')?.textContent ?? '';
    expect(text).not.toContain('</script>');
    expect(text).not.toMatch(/[<>&\u2028]/);
    expect(JSON.parse(text).name).toBe('</script><b>x & y\u2028z');
  });

  it('should write no JSON-LD block when none is given', async () => {
    renderSeo({ title: 'Plain', description: 'No data', path: '/' });
    await waitFor(() => expect(document.title).toBe('Plain | cryptopapertrade.com'));
    expect(document.querySelector('script[type="application/ld+json"]')).toBeNull();
  });
});
