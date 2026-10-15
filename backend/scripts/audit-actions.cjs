const fs = require("node:fs")
const ts = require("typescript")
const entries = []
for (const name of fs.readdirSync("backend/actions")) {
  if (!name.endsWith(".ts")) continue
  const file = `backend/actions/${name}`, source = fs.readFileSync(file, "utf8")
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  for (const node of tree.statements) {
    if (ts.isFunctionDeclaration(node) && node.name && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
      const body = node.body?.getText(tree) || ""
      entries.push({ file, action: node.name.text, directGuard: /\b(auth|activeUser|require\w*|checkRateLimit)\s*\(/.test(body), databaseMutation: /\.(create|createMany|update|updateMany|delete|deleteMany|upsert)\s*\(/.test(body) })
    }
  }
}
console.log(JSON.stringify(entries.filter(e => e.databaseMutation && !e.directGuard), null, 2))
console.log(`${entries.length} exported actions inventoried; candidates require review of delegated guards and intended public access.`)
