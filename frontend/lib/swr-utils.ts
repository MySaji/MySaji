// Server Action calls ride a plain fetch() with no built-in timeout. If the
// underlying connection to the DB pooler is reset mid-request without the
// browser ever observing a close event, that fetch can hang forever — SWR
// on its own wouldn't notice, so any fetcher handed to useSWR should be
// wrapped in this. Shared by every SWR-converted page in the app.
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (err) => { clearTimeout(timer); reject(err) },
    )
  })
}

export const DASHBOARD_FETCH_TIMEOUT_MS = 25000
