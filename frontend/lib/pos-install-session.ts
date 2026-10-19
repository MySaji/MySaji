/** Clear only Till HTML/chunk caches; queued sales in IndexedDB are preserved. */
export async function clearTillInstallCache() {
  if (typeof caches === "undefined") return
  const names = await caches.keys()
  await Promise.all(names.filter(name => name.startsWith("saji-till-shell-")).map(name => caches.delete(name)))
}
