import { describe, it, expect, beforeEach } from 'vitest';

import { useReportDraft } from '../reportDraftStore';

const shot = { name: 's.jpg', type: 'image/jpeg' as const, data: 'QUJD' };

describe('the bug report draft', () => {
  beforeEach(() => useReportDraft.getState().reset());

  const write = () => {
    const d = useReportDraft.getState();
    d.setDescription('Something I was writing');
    d.setScreenshots([shot]);
  };

  it('should keep the draft for the account that wrote it, however often it is opened', () => {
    useReportDraft.getState().claim('u1');
    write();
    useReportDraft.getState().claim('u1');
    const d = useReportDraft.getState();
    expect([d.description, d.screenshots.length]).toEqual(['Something I was writing', 1]);
  });

  it('should throw a draft away when another account opens the panel, so a shared computer shows nothing of the last', () => {
    useReportDraft.getState().claim('u1');
    write();
    useReportDraft.getState().claim('u2');
    const d = useReportDraft.getState();
    expect([d.owner, d.description, d.screenshots.length]).toEqual(['u2', '', 0]);
  });

  it('should throw away a draft nobody claimed', () => {
    write();
    useReportDraft.getState().claim('u1');
    expect(useReportDraft.getState().description).toBe('');
  });

  it('should forget its owner as well when it is reset (a report was sent)', () => {
    useReportDraft.getState().claim('u1');
    useReportDraft.getState().reset();
    expect(useReportDraft.getState().owner).toBeNull();
  });
});
