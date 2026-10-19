const { test } = require("node:test")
const assert = require("node:assert/strict")
const { loadService } = require("./load-service.cjs")
const { NextRequest, NextResponse } = require("next/server")

test("installed startup uses the current session and treats a shop slug as branding only", async () => {
  let signedIn = false
  const route = loadService("app/(pos)/pos/open/route.ts", {
    "next/server": { NextRequest, NextResponse }, "@/backend/auth": { auth: async () => signedIn ? { user: { id: "employee" } } : null },
  }, { URL })
  const visit = query => route.GET(new NextRequest(`https://mysaji.com/pos/open${query}`))
  let response = await visit("")
  assert.equal(response.headers.get("location"), "https://mysaji.com/pos/login")
  response = await visit("?shop=amina-shop")
  assert.equal(response.headers.get("location"), "https://mysaji.com/pos/welcome/amina-shop")
  assert.equal(response.cookies.get("saji-till-shop").value, "amina-shop")
  assert.equal(response.headers.get("cache-control"), "private, no-store")
  assert.equal((await visit("?shop=amina-shop&signin=1")).headers.get("location"), "https://mysaji.com/pos/login")
  response = await visit("?shop=https://external.example&next=https://external.example")
  assert.equal(response.headers.get("location"), "https://mysaji.com/pos/login")
  assert.equal(response.cookies.get("saji-till-shop"), undefined)
  signedIn = true
  assert.equal((await visit("?shop=amina-shop")).headers.get("location"), "https://mysaji.com/pos/home")
  assert.equal((await visit("?shop=amina-shop&install=1")).headers.get("location"), "https://mysaji.com/pos/get")
})
