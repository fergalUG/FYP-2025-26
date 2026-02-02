import type { RetryOptions } from '@/types/async';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const withRetry = async <T>(operation: () => Promise<T>, options: RetryOptions): Promise<T | null> => {
  let attempt = 0;
  let delayMs = options.baseDelayMs;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      attempt += 1;
      const err = error instanceof Error ? error : new Error('Unknown error');

      if (attempt > options.maxRetries) {
        return null;
      }

      options.onRetry?.(attempt, err);
      await sleep(delayMs);
      delayMs = Math.min(delayMs * 2, options.maxDelayMs);
    }
  }
};
