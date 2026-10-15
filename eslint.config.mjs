import reactHooks from "eslint-plugin-react-hooks"
import nextPlugin from "@next/eslint-plugin-next"
import tseslint from "typescript-eslint"

export default [
  { ignores: ["node_modules/**", ".next/**", ".task-tools/**", "image-backup/**", "next-env.d.ts"] },
  { files: ["**/*.{ts,tsx}"], plugins: { "react-hooks": reactHooks, "@next/next": nextPlugin }, languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } }, rules: {
    "react-hooks/rules-of-hooks": "error", "react-hooks/exhaustive-deps": "warn",
    "no-eval": "error", "no-implied-eval": "error", "no-new-func": "error",
    "no-unreachable": "error", "no-async-promise-executor": "error", "no-dupe-args": "error",
    "no-unsafe-finally": "error", "no-sparse-arrays": "error",
  } },
]
