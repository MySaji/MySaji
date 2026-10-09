# Manual migrations

This project uses `prisma db push`, not `prisma migrate`, so there is no
migration history table and these files are **a record, not a mechanism**.
Nothing replays them automatically.

They exist because `db push` refuses a change it considers destructive and
offers only `--accept-data-loss`, which is a blunt instrument: it suppresses
the warning without showing what it is suppressing. For the POS foundation the
flagged change was relaxing `products.sku` from globally unique to unique per
shop — which cannot invalidate an existing row, but is indistinguishable from a
genuinely destructive change until somebody looks.

So the SQL was generated with `prisma migrate diff`, read, and applied with
`prisma db execute`. Keeping the file means the exact DDL that ran against the
shared database is reviewable afterwards.

| File | What it did |
|---|---|
| `20261009_pos_foundation.sql` | POS tables, enums, the `shopkeeper_profiles` and `products` columns, `inventory.stockOnHand`, and `products.sku` from global to per-shop uniqueness |
| `20261009_pos_enum.sql` | `ProBusinessType` gains `POS` |

## Regenerating one

```
npx prisma migrate diff --from-url "$DIRECT_URL" \
  --to-schema-datamodel prisma/schema.prisma --script > out.sql
```

Read it. If it drops or retypes a column, check the data first — the
`products.sku` change above was only safe because a query confirmed zero
duplicate `(shopkeeperId, sku)` pairs. Then:

```
npx prisma db execute --file out.sql --schema prisma/schema.prisma
```

Use `DIRECT_URL` (session mode, port 5432), not the pooled URL. DDL through
pgbouncer's transaction pooling has bitten this project before.
