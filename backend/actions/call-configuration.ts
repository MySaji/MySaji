"use server"
import { createHmac } from "node:crypto"
import { activeUser } from "@/backend/services/active-user"

export async function getCallIceServers(): Promise<RTCIceServer[]> {
  const user = await activeUser()
  if (!user) return []
  const servers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }]
  const url = process.env.TURN_URL, secret = process.env.TURN_SHARED_SECRET
  if (url && secret && /^turns?:/.test(url)) {
    const username = `${Math.floor(Date.now() / 1000) + 3600}:${user.id}`
    servers.push({ urls: url, username, credential: createHmac("sha1", secret).update(username).digest("base64") })
  }
  return servers
}
