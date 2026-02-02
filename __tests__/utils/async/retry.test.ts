import { withRetry } from '@utils/async/retry';

describe('withRetry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('retries and eventually succeeds', async () => {
    const op = jest.fn().mockRejectedValueOnce(new Error('fail-1')).mockRejectedValueOnce(new Error('fail-2')).mockResolvedValueOnce('ok');

    const onRetry = jest.fn();

    const promise = withRetry(op, {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 4000,
      onRetry,
    });

    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('ok');
    expect(op).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('returns null after exceeding retry limit', async () => {
    const op = jest.fn().mockRejectedValue(new Error('fail'));

    const promise = withRetry(op, {
      maxRetries: 2,
      baseDelayMs: 1000,
      maxDelayMs: 4000,
    });

    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeNull();
    expect(op).toHaveBeenCalledTimes(3);
  });
});
