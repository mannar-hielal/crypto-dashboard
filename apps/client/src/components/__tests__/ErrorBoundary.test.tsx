import { type ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary';

function ThrowOnRender(): ReactNode {
  throw new Error('test-error-boundary');
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">hello</div>
      </ErrorBoundary>
    );
    expect(screen.getByTestId('child')).toBeDefined();
    expect(screen.getByText('hello')).toBeDefined();
  });

  it('catches error and shows fallback', () => {
    render(
      <ErrorBoundary>
        <ThrowOnRender />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeDefined();
    expect(screen.getByText('test-error-boundary')).toBeDefined();
  });

  it('logs error to console', () => {
    render(
      <ErrorBoundary>
        <ThrowOnRender />
      </ErrorBoundary>
    );
    expect(console.error).toHaveBeenCalled();
  });

  it('renders custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div data-testid="custom">custom fallback</div>}>
        <ThrowOnRender />
      </ErrorBoundary>
    );
    expect(screen.getByTestId('custom')).toBeDefined();
    expect(screen.getByText('custom fallback')).toBeDefined();
  });
});
