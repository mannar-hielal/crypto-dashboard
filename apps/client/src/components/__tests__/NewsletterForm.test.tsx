import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

const mockSubscribe = vi.fn();
vi.mock('@crypto-dashboard/sdk', () => ({
  newsletterApi: {
    subscribe: (...args: unknown[]) => mockSubscribe(...args),
  },
}));

vi.mock('react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) =>
    React.createElement('a', { href: to, ...props }, children),
}));

import { NewsletterForm } from '../NewsletterForm';

function getForm() {
  return screen.getByRole('textbox', { name: /email/i }).closest('form')!;
}

function getInput() {
  return screen.getByRole('textbox', { name: /email/i });
}

function getSubmitButton() {
  return getForm().querySelector('button')!;
}

describe('NewsletterForm', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('renders email input and submit button', () => {
      render(React.createElement(NewsletterForm));
      expect(getInput()).not.toBeNull();
      expect(getSubmitButton()).not.toBeNull();
    });

    it('does not show success or error messages on mount', () => {
      render(React.createElement(NewsletterForm));
      expect(screen.queryByText(/check your inbox/i)).toBeNull();
      expect(screen.queryByText(/valid email/i)).toBeNull();
    });
  });

  describe('validation', () => {
    it('shows error for invalid email on submit', async () => {
      render(React.createElement(NewsletterForm));
      const input = getInput();
      const form = input.closest('form')!;

      fireEvent.change(input, { target: { value: 'not-an-email' } });
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText(/please enter a valid email/i)).not.toBeNull();
      });
      expect(mockSubscribe).not.toHaveBeenCalled();
    });

    it('shows error for empty email on submit', async () => {
      render(React.createElement(NewsletterForm));
      const form = getInput().closest('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText(/please enter a valid email/i)).not.toBeNull();
      });
      expect(mockSubscribe).not.toHaveBeenCalled();
    });
  });

  describe('API interaction', () => {
    beforeEach(() => {
      mockSubscribe.mockResolvedValue({ message: 'Check your inbox' });
    });

    it('calls newsletterApi.subscribe with trimmed email on valid submit', async () => {
      render(React.createElement(NewsletterForm));
      fireEvent.change(getInput(), { target: { value: '  user@example.com  ' } });
      fireEvent.submit(getForm());

      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalledWith('user@example.com');
      });
    });

    it('disables input and button during loading', async () => {
      mockSubscribe.mockImplementation(() => new Promise(() => {}));
      render(React.createElement(NewsletterForm));

      fireEvent.change(getInput(), { target: { value: 'user@example.com' } });
      fireEvent.submit(getForm());

      await waitFor(() => {
        expect(getInput()).toHaveProperty('disabled', true);
        expect(getSubmitButton()).toHaveProperty('disabled', true);
      });
    });
  });

  describe('success state', () => {
    it('shows success message after successful subscribe', async () => {
      mockSubscribe.mockResolvedValue({ message: 'Check your inbox' });
      render(React.createElement(NewsletterForm));

      fireEvent.change(getInput(), { target: { value: 'user@example.com' } });
      fireEvent.submit(getForm());

      await waitFor(() => {
        expect(screen.getByText(/check your inbox/i)).not.toBeNull();
      });
    });

    it('replaces form with success UI', async () => {
      mockSubscribe.mockResolvedValue({ message: 'Check your inbox' });
      render(React.createElement(NewsletterForm));

      fireEvent.change(getInput(), { target: { value: 'user@example.com' } });
      fireEvent.submit(getForm());

      await waitFor(() => {
        expect(screen.queryByRole('textbox')).toBeNull();
        expect(screen.getByText(/check your inbox/i)).not.toBeNull();
      });
    });
  });

  describe('error state', () => {
    it('shows error message after API rejection', async () => {
      mockSubscribe.mockRejectedValue(new Error('Something went wrong'));
      render(React.createElement(NewsletterForm));

      fireEvent.change(getInput(), { target: { value: 'user@example.com' } });
      fireEvent.submit(getForm());

      await waitFor(() => {
        expect(screen.getByText(/something went wrong/i)).not.toBeNull();
      });
    });

    it('shows generic error when API rejects with non-Error', async () => {
      mockSubscribe.mockRejectedValue('server error');
      render(React.createElement(NewsletterForm));

      fireEvent.change(getInput(), { target: { value: 'user@example.com' } });
      fireEvent.submit(getForm());

      await waitFor(() => {
        expect(screen.getByText(/something went wrong/i)).not.toBeNull();
      });
    });

    it('clears error state when user starts typing', async () => {
      mockSubscribe.mockRejectedValue(new Error('Some error'));
      render(React.createElement(NewsletterForm));

      fireEvent.change(getInput(), { target: { value: 'user@example.com' } });
      fireEvent.submit(getForm());

      await waitFor(() => {
        expect(screen.getByText(/some error/i)).not.toBeNull();
      });

      fireEvent.change(getInput(), { target: { value: 'new@example.com' } });

      await waitFor(() => {
        expect(screen.queryByText(/some error/i)).toBeNull();
      });
    });
  });
});
