export async function waitForCondition(
  predicate: () => Promise<boolean> | boolean,
  options?: { timeout?: number; interval?: number }
) {
  const timeout = options?.timeout ?? 5000;
  const interval = options?.interval ?? 100;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      const ok = await Promise.resolve(predicate());
      if (ok) return;
    } catch (e) {
      // ignore predicate errors and retry
    }
    await new Promise((res) => setTimeout(res, interval));
  }

  throw new Error('Timed out waiting for condition');
}
