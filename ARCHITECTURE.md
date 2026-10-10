# How this repo is laid out

One Next.js application, with the server side and the client side kept in
separate folders.

```
app/          routes only — thin, imports from both sides
backend/      everything that runs on a server
frontend/     everything that runs in a browser
```

## Why `app/` is not inside `frontend/`

Next.js finds routes by convention, at the repository root or under `src/`.
Moving `app/` into `frontend/` would stop it being an application. So `app/`
stays where Next needs it and holds as little as possible: each file there is
a route that wires a page together out of pieces from the other two folders.

That is the one compromise in this layout, and it is Next's, not a choice.

## `backend/`

| Folder      | What belongs there |
|-------------|--------------------|
| `prisma/`   | The schema and its migrations. |
| `db.ts`     | The Prisma client. |
| `auth.ts`   | NextAuth configuration. |
| `actions/`  | Every `"use server"` module. This is the API. |
| `services/` | Server-only libraries: SMS, email, payments, the stock ledger, AI. Anything holding a secret or reaching a third party. |
| `domain/`   | Pure modules with no side of their own. |
| `scripts/`  | Operational scripts, run by hand. |

### `actions/` is the API

There are no REST controllers for the app's own use, because a server action
*is* the endpoint: a function the client calls directly, type-checked end to
end, with no hand-written fetch and no second copy of every type. The
`app/api/` routes that remain exist for callers that cannot invoke a server
action — webhooks, cron, health checks.

Two rules hold everywhere in `actions/`:

- **A module may export only async functions.** Exporting a constant from a
  `"use server"` file compiles, passes `tsc`, passes `next build`, and then
  throws at request time. Shared constants go in `domain/`.
- **No function takes the tenant as a parameter.** The shop is read from the
  session, every time. A `shopkeeperId` argument is a hole waiting for
  someone to pass another shop's.

### What `domain/` is for

Modules that are genuinely neither: the POS trait list, the config schemas,
the role map, the shop-type presets. They have no database access, no
secrets, no DOM, and both sides import them.

They sit under `backend/` because the domain model is the server's to define.
A page importing `@/backend/domain/pos-traits` is importing a definition, not
reaching across a boundary.

## `frontend/`

| Folder        | What belongs there |
|---------------|--------------------|
| `components/` | React components. |
| `hooks/`      | React hooks. |
| `lib/`        | Client-only helpers: the `cn` class helper, SWR config, the IndexedDB offline queue. |
| `styles/`     | Stylesheets. The live one is `app/globals.css`; this folder is legacy. |

## Where does a new file go?

Ask what it needs to run, not what it is about:

- Reads the database, the session, or a secret → `backend/`
- Touches `window`, `document`, or React state → `frontend/`
- Neither → `backend/domain/`

If it would need both, it is two files.

## Import paths

A single alias, `@/` for the repository root:

```ts
import { recordPosSale } from "@/backend/actions/pos-sales"
import { POS_TRAITS }    from "@/backend/domain/pos-traits"
import { Button }        from "@/frontend/components/ui/button"
```

Prefer the alias to a relative path even between siblings. The previous
layout used `./pos-config` between files that later turned out to belong on
opposite sides of this boundary, and every one of those broke when they were
separated.

## Things that know about these paths

Changing the layout again means changing these too — none of them fail loudly
if missed:

- `package.json` → `prisma.schema`, and the `postbuild` script path
- `components.json` → the shadcn aliases, which decide where generated
  components land
- `tsconfig.json` → the `@/*` path mapping

## Running it

```bash
pnpm dev                  # development
pnpm build                # production build
pnpm db:push              # push the schema
npx prisma studio         # browse the data
```

On Windows, `pnpm build` ends with `EPERM ... symlink ... .next/standalone`.
That is the standalone output step needing symlink permission, after
compilation and page generation have both succeeded. It is not a code
failure.
