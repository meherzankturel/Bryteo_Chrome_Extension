import { describe, it, expect } from 'vitest';

describe('vitest setup', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });

  it('has chrome stub', () => {
    expect((globalThis as any).chrome.storage.local.get).toBeDefined();
  });
});
