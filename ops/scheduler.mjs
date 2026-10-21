// Matches vercel.json in UTC. Enable only after rehearsal and delivery approval.
if (!process.env.CRON_SECRET) throw new Error("CRON_SECRET is required")
let lastMinute = ""
let running = false
async function tick() {
  if (running) return
  const now = new Date()
  const minute = now.toISOString().slice(0, 16)
  if (minute === lastMinute) return
  lastMinute = minute
  if (now.getUTCMinutes() !== 0) return
  const routes = []
  if (now.getUTCHours() === 2) routes.push("expire-provider-stories")
  if (now.getUTCDay() === 1 && now.getUTCHours() === 8) routes.push("email-digest")
  if (now.getUTCDay() === 1 && now.getUTCHours() === 9) routes.push("subscriber-digest")
  running = true
  try {
    for (const route of routes) {
      const response = await fetch(`http://app:3000/api/cron/${route}`, {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
        signal: AbortSignal.timeout(300000),
      })
      console.log(new Date().toISOString(), route, response.status)
      if (!response.ok) console.error("Job failed; operator review required before retry")
    }
  } catch (error) { console.error("Job transport failure", error.name) }
  finally { running = false }
}
await tick()
setInterval(tick, 15000)
