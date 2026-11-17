import { afterEach, describe, expect, it, vi } from 'vitest';
import { learnApi } from '@crypto-dashboard/sdk';

describe('learnApi requests', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('should bound every request with a timeout, so a stalled one settles', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"items":[]}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await learnApi.getProgress('tok');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('should keep the status of a refusal whose body isn’t JSON (an edge’s HTML 502)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }))
    );
    await expect(learnApi.getProgress('tok')).rejects.toMatchObject({ status: 502 });
  });

  it('should keep a refusal’s status and its message', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('{"error":"An earlier version of this lesson"}', { status: 409 })
        )
    );
    await expect(learnApi.setProgress('lesson-01', 'completed', 'tok', 61)).rejects.toMatchObject({
      status: 409,
      message: 'An earlier version of this lesson',
    });
  });
});
