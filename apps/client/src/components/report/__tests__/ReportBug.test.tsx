import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within, act } from '@testing-library/react';

import { guideSelector } from '@/lib/guideAnchors';
import { useAuthStore } from '@/store/authStore';
import { useReportDraft } from '@/store/reportDraftStore';

const send = vi.hoisted(() => vi.fn());
const prepare = vi.hoisted(() => vi.fn());

vi.mock('@/lib/sendBugReport', async () => {
  const actual = await vi.importActual<typeof import('@/lib/sendBugReport')>('@/lib/sendBugReport');
  return { ...actual, sendBugReport: send };
});
vi.mock('@/lib/reportImages', async () => {
  const actual = await vi.importActual<typeof import('@/lib/reportImages')>('@/lib/reportImages');
  return { ...actual, prepareScreenshot: prepare };
});

import { BugReportError } from '@/lib/sendBugReport';
import { ReportBugButton } from '../ReportBugButton';
import { ReportBugPanel } from '../ReportBugPanel';

const shot = (n: number) => ({ name: `s${n}.jpg`, type: 'image/jpeg' as const, data: 'QUJD' });
const signIn = () =>
  useAuthStore.getState().setAuth('tok', { id: 'u1', email: 'ada@example.com', username: 'ada' });

const email = () => screen.getByLabelText('Your email address') as HTMLInputElement;
const description = () => screen.getByLabelText('Description (required)') as HTMLTextAreaElement;
const submit = () => screen.getByRole('button', { name: 'Submit' });

beforeEach(() => {
  send.mockReset();
  prepare.mockReset();
  useReportDraft.getState().reset();
  useAuthStore.getState().clearAuth();
  window.history.pushState({}, '', '/chart');
});
afterEach(cleanup);

describe('ReportBugButton', () => {
  it('should not be drawn for a guest', () => {
    render(<ReportBugButton variant="bar" anchor="nav.report" />);
    expect(screen.queryByRole('button', { name: 'Report a bug' })).toBeNull();
  });

  it('should open "Found a bug?" as a dialog when a signed-in user clicks it', () => {
    signIn();
    render(<ReportBugButton variant="bar" anchor="nav.report" />);
    const trigger = screen.getByRole('button', { name: 'Report a bug' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Found a bug?' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector(guideSelector('report.panel'))).not.toBeNull();
  });

  it('should not show one account the draft another account left on the same computer', () => {
    signIn();
    useReportDraft.getState().claim('someone-else');
    useReportDraft.getState().setDescription('Their private words');
    useReportDraft.getState().setScreenshots([shot(1)]);
    render(<ReportBugButton variant="bar" anchor="nav.report" />);
    fireEvent.click(screen.getByRole('button', { name: 'Report a bug' }));
    expect(description().value).toBe('');
    expect(useReportDraft.getState().screenshots).toHaveLength(0);
  });

  it('should wipe the draft when the user signs out and the icon goes', () => {
    signIn();
    const { unmount } = render(<ReportBugButton variant="bar" anchor="nav.report" />);
    fireEvent.click(screen.getByRole('button', { name: 'Report a bug' }));
    fireEvent.change(description(), { target: { value: 'Private words' } });
    useAuthStore.getState().clearAuth();
    unmount();
    expect(useReportDraft.getState().description).toBe('');
    expect(useReportDraft.getState().owner).toBeNull();
  });

  it('should keep the draft when the icon goes for another reason, such as leaving the page, still signed in', () => {
    signIn();
    const { unmount } = render(<ReportBugButton variant="bar" anchor="nav.report" />);
    fireEvent.click(screen.getByRole('button', { name: 'Report a bug' }));
    fireEvent.change(description(), { target: { value: 'Half a thought' } });
    unmount();
    expect(useReportDraft.getState().description).toBe('Half a thought');
  });

  it('should keep a draft that the same account wrote, when it opens the panel again', () => {
    signIn();
    render(<ReportBugButton variant="bar" anchor="nav.report" />);
    const trigger = screen.getByRole('button', { name: 'Report a bug' });
    fireEvent.click(trigger);
    fireEvent.change(description(), { target: { value: 'Half a thought, not sent' } });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    fireEvent.click(trigger);
    expect(description().value).toBe('Half a thought, not sent');
  });

  it('should close on Esc and give the focus back to the icon', async () => {
    signIn();
    render(<ReportBugButton variant="sheet" anchor="lesson.report" />);
    const trigger = screen.getByRole('button', { name: 'Report a bug' });
    fireEvent.click(trigger);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('should carry the anchor it was given, for the tour and the tests', () => {
    signIn();
    render(<ReportBugButton variant="sheet" anchor="checkpoint.report" />);
    expect(document.querySelector(guideSelector('checkpoint.report'))).not.toBeNull();
  });
});

describe('ReportBugPanel', () => {
  const open = (onClose = vi.fn()) => {
    signIn();
    render(<ReportBugPanel onClose={onClose} />);
    return onClose;
  };

  it('should show the account e-mail, read only, and put the cursor in the description', () => {
    open();
    expect(email().value).toBe('ada@example.com');
    expect(email().readOnly).toBe(true);
    expect(document.activeElement).toBe(description());
    expect(screen.getByText(/We will write to this address/)).not.toBeNull();
  });

  it("should not let the e-mail be changed, and show the account's whatever the draft holds", () => {
    open();
    fireEvent.change(email(), { target: { value: 'someone.else@example.org' } });
    expect(email().value).toBe('ada@example.com');
  });

  it('should not send without a description, and say what is missing', () => {
    open();
    fireEvent.click(submit());
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByText(/at least 10 characters/)).not.toBeNull();
    expect(description().getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(description(), { target: { value: 'too short' } });
    fireEvent.click(submit());
    expect(send).not.toHaveBeenCalled();
  });

  it('should send the description, where the reporter was and the screenshots, with no address (the server uses the account address)', async () => {
    send.mockResolvedValue(undefined);
    prepare.mockResolvedValue(shot(1));
    open();
    fireEvent.change(description(), { target: { value: '  The chart froze on BTC.  ' } });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, {
        target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] },
      });
    });
    fireEvent.click(submit());
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const sent = send.mock.calls[0][0];
    expect(sent).not.toHaveProperty('email');
    expect(sent.description).toBe('The chart froze on BTC.');
    expect(sent.context).toMatchObject({ area: 'chart', path: '/chart' });
    expect(sent.screenshots).toHaveLength(1);
    expect(await screen.findByText('Thanks, we got your report.')).not.toBeNull();
    // Sent: the draft is gone
    expect(useReportDraft.getState().description).toBe('');
    expect(useReportDraft.getState().screenshots).toHaveLength(0);
  });

  it('should tell the reporter what went wrong, and keep what they wrote, when the send fails', async () => {
    send.mockRejectedValue(new BugReportError('x', 429));
    open();
    fireEvent.change(description(), { target: { value: 'It broke when I clicked Buy.' } });
    fireEvent.click(submit());
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('a few reports already')
    );
    expect(useReportDraft.getState().description).toBe('It broke when I clicked Buy.');
    // And it can be sent again
    send.mockResolvedValue(undefined);
    fireEvent.click(submit());
    expect(await screen.findByText('Thanks, we got your report.')).not.toBeNull();
  });

  it('should say a dropped connection plainly', async () => {
    send.mockRejectedValue(new BugReportError('Failed to fetch', 0));
    open();
    fireEvent.change(description(), { target: { value: 'It broke when I clicked Buy.' } });
    fireEvent.click(submit());
    expect((await screen.findByRole('alert')).textContent).toMatch(/Check your connection/);
  });

  it("should show the server's own words for a refused screenshot", async () => {
    send.mockRejectedValue(new BugReportError('Screenshot 1 is not a valid image/png image', 400));
    open();
    fireEvent.change(description(), { target: { value: 'It broke when I clicked Buy.' } });
    fireEvent.click(submit());
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Screenshot 1 is not a valid image/png image'
    );
  });

  it('should tell an unverified account to verify its address, not show a bare 403', async () => {
    send.mockRejectedValue(
      new BugReportError('Verify your email address before sending a report.', 403)
    );
    open();
    fireEvent.change(description(), { target: { value: 'It broke when I clicked Buy.' } });
    fireEvent.click(submit());
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /Verify your email address first/
    );
  });

  it("should show the server's own words for an account that is being deleted, not a verify prompt", async () => {
    send.mockRejectedValue(
      new BugReportError('This account is being deleted and cannot send reports.', 403)
    );
    open();
    fireEvent.change(description(), { target: { value: 'It broke when I clicked Buy.' } });
    fireEvent.click(submit());
    const text = (await screen.findByRole('alert')).textContent ?? '';
    expect(text).toMatch(/being deleted/);
    expect(text).not.toMatch(/Verify/);
  });

  it('should ignore a pasted image while the report is being sent, so it cannot linger into the next one', async () => {
    let finish: () => void = () => {};
    send.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    prepare.mockResolvedValue(shot(1));
    open();
    fireEvent.change(description(), { target: { value: 'It broke when I clicked Buy.' } });
    fireEvent.click(submit());
    await screen.findByRole('button', { name: 'Sending…' });
    await act(async () => {
      fireEvent.paste(description(), {
        clipboardData: {
          files: [new File(['x'], 'image.png', { type: 'image/png' })],
          types: ['Files'],
          items: [],
        },
      });
    });
    expect(prepare).not.toHaveBeenCalled();
    await act(async () => finish());
    expect(await screen.findByText('Thanks, we got your report.')).not.toBeNull();
    expect(useReportDraft.getState().screenshots).toHaveLength(0);
  });

  it('should not show the reporter a schema message, only that the report was not accepted', async () => {
    send.mockRejectedValue(
      new BugReportError('body/context/viewport must NOT have more than 20 characters', 400)
    );
    open();
    fireEvent.change(description(), { target: { value: 'It broke when I clicked Buy.' } });
    fireEvent.click(submit());
    const text = (await screen.findByRole('alert')).textContent ?? '';
    expect(text).toMatch(/was not accepted/);
    expect(text).not.toMatch(/body\/context|NOT have/);
  });

  it('should show a count for the screenshots, remove them, and stop at three', async () => {
    prepare.mockImplementation(async () => shot(1));
    open();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const files = [1, 2, 3, 4].map((n) => new File(['x'], `a${n}.png`, { type: 'image/png' }));
    await act(async () => {
      fireEvent.change(input, { target: { files } });
    });
    // Three of four fit: the chip counts them, the button is spent, and it says why
    expect(prepare).toHaveBeenCalledTimes(3);
    const chip = screen.getByText('Screenshot', { selector: 'span' }).parentElement as HTMLElement;
    expect(within(chip).getByText('3')).not.toBeNull();
    expect((screen.getByRole('button', { name: 'Screenshot' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(screen.getByText('Three screenshots at most.')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove all screenshots' }));
    expect(useReportDraft.getState().screenshots).toHaveLength(0);
    expect((screen.getByRole('button', { name: 'Screenshot' }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });

  describe('pasting an image', () => {
    const png = () => new File(['x'], 'image.png', { type: 'image/png' });
    const paste = (target: Element, clipboardData: Record<string, unknown>) =>
      act(async () => {
        fireEvent.paste(target, { clipboardData });
      });

    it('should attach an image pasted into the description, like a picked one', async () => {
      prepare.mockResolvedValue(shot(1));
      open();
      await paste(description(), { files: [png()], types: ['Files'], items: [] });
      expect(prepare).toHaveBeenCalledTimes(1);
      expect(useReportDraft.getState().screenshots).toHaveLength(1);
      const chip = screen.getByText('Screenshot', { selector: 'span' })
        .parentElement as HTMLElement;
      expect(within(chip).getByText('1')).not.toBeNull();
    });

    it('should take it from the clipboard items where the browser lists no files', async () => {
      prepare.mockResolvedValue(shot(1));
      open();
      await paste(description(), {
        files: [],
        types: ['Files'],
        items: [{ kind: 'file', getAsFile: () => png() }],
      });
      expect(useReportDraft.getState().screenshots).toHaveLength(1);
    });

    it('should leave a text-only paste alone', async () => {
      open();
      await paste(description(), { files: [], types: ['text/plain'], items: [] });
      expect(prepare).not.toHaveBeenCalled();
    });

    it('should ignore a pasted file that is not an image', async () => {
      open();
      const pdf = new File(['x'], 'a.pdf', { type: 'application/pdf' });
      await paste(description(), { files: [pdf], types: ['Files'], items: [] });
      expect(prepare).not.toHaveBeenCalled();
    });

    it('should keep the default for an image that comes with text, so the text still pastes', async () => {
      prepare.mockResolvedValue(shot(1));
      open();
      const proceeded = fireEvent.paste(description(), {
        clipboardData: { files: [png()], types: ['Files', 'text/plain'], items: [] },
      });
      await act(async () => {});
      expect(proceeded).toBe(true);
      expect(useReportDraft.getState().screenshots).toHaveLength(1);
    });

    it('should stop the browser pasting the image itself when there is no text with it', async () => {
      prepare.mockResolvedValue(shot(1));
      open();
      const proceeded = fireEvent.paste(description(), {
        clipboardData: { files: [png()], types: ['Files'], items: [] },
      });
      await act(async () => {});
      expect(proceeded).toBe(false);
    });

    it('should stop at three, and say so, when more are pasted', async () => {
      prepare.mockResolvedValue(shot(1));
      useReportDraft.getState().setScreenshots([shot(1), shot(2), shot(3)]);
      open();
      await paste(description(), { files: [png()], types: ['Files'], items: [] });
      expect(prepare).not.toHaveBeenCalled();
      expect(screen.getByText('Three screenshots at most.')).not.toBeNull();
      expect(useReportDraft.getState().screenshots).toHaveLength(3);
    });

    it('should say why a pasted image was refused', async () => {
      const { ScreenshotError } = await import('@/lib/reportImages');
      prepare.mockRejectedValue(new ScreenshotError('That image is too large (20 MB at most).'));
      open();
      await paste(description(), { files: [png()], types: ['Files'], items: [] });
      expect(screen.getByText('That image is too large (20 MB at most).')).not.toBeNull();
    });

    it('should tell the reporter pasting works, until there is a screenshot', async () => {
      prepare.mockResolvedValue(shot(1));
      open();
      expect(screen.getByText(/Or paste an image/)).not.toBeNull();
      await paste(description(), { files: [png()], types: ['Files'], items: [] });
      expect(screen.queryByText(/Or paste an image/)).toBeNull();
    });
  });

  it('should say why an image was refused, and keep the ones that were fine', async () => {
    const { ScreenshotError } = await import('@/lib/reportImages');
    prepare
      .mockResolvedValueOnce(shot(1))
      .mockRejectedValueOnce(new ScreenshotError('Use a PNG, JPEG or WebP image.'));
    open();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, {
        target: {
          files: [
            new File(['x'], 'a.png', { type: 'image/png' }),
            new File(['x'], 'b.gif', { type: 'image/gif' }),
          ],
        },
      });
    });
    expect(screen.getByText('Use a PNG, JPEG or WebP image.')).not.toBeNull();
    expect(useReportDraft.getState().screenshots).toHaveLength(1);
  });

  it('should close on Esc without the key reaching a lesson or a map under it', () => {
    const onClose = open();
    const underneath = vi.fn();
    window.addEventListener('keydown', underneath);
    fireEvent.keyDown(description(), { key: 'Escape' });
    window.removeEventListener('keydown', underneath);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(underneath).not.toHaveBeenCalled();
  });

  it('should keep Tab inside itself, and not hand its keys to a sheet it sits over', () => {
    open();
    const parentKey = vi.fn();
    // A parent in the React tree (the lesson sheet) would see a key rise through the portal
    const { unmount } = render(
      <div onKeyDown={parentKey}>
        <ReportBugPanel onClose={() => {}} />
      </div>
    );
    fireEvent.keyDown(screen.getAllByLabelText('Description (required)')[1], { key: 'a' });
    expect(parentKey).not.toHaveBeenCalled();
    unmount();
  });

  it('should close from the X and from a click outside, and say what goes with the report', () => {
    const onClose = open();
    expect(screen.getByText(/^Sent with it:/).textContent).toContain('page /chart');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(document.querySelector('[class*="scrim"]')!);
    expect(onClose).toHaveBeenCalledTimes(2);
    // A press inside the panel does not close it
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
