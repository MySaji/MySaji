const fs = require("node:fs")
const vm = require("node:vm")
const ts = require("typescript")

// Execute the actual TypeScript service with explicit dependencies. Tests never
// import application auth, send notifications, or implicitly connect to .env.
exports.loadService = (file, dependencies = {}, globals = {}) => {
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(source, { module, exports: module.exports, Buffer, Date, process, console, require: name => {
    if (name === "server-only") return {}
    if (Object.hasOwn(dependencies, name)) return dependencies[name]
    if (name.startsWith("node:") || name === "@prisma/client") return require(name)
    throw new Error(`Unmocked dependency: ${name}`)
  }, ...globals }, { filename: file })
  return module.exports
}
