"use client"

import { useState } from "react"
import useSWRInfinite from "swr/infinite"
import { useAuthContext } from "@/frontend/lib/auth-context"
import { getAdminTeamActivity, type AdminTeamActivity } from "@/backend/actions/admin-team-activity"
import { eastAfricaDay } from "@/backend/domain/workspace-personalization"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/frontend/components/ui/dialog"
import { Input } from "@/frontend/components/ui/input"
import { Button } from "@/frontend/components/ui/button"

export function TeamActivityDialog({
  member,
  onClose,
}: {
  member: { id: string; name: string } | null
  onClose: () => void
}) {
  const { user } = useAuthContext()
  const [draft, setDraft] = useState(() => ({
    from: eastAfricaDay(Date.now() - 6 * 86_400_000),
    to: eastAfricaDay(),
  }))
  const [applied, setApplied] = useState(draft)
  const { data, error, isLoading, isValidating, mutate, size, setSize } = useSWRInfinite<AdminTeamActivity>(
    (index, previous) =>
      !member || user?.role !== "admin" || (index > 0 && !previous?.next)
        ? null
        : [
            "admin-team-recorded-work",
            user.id,
            member.id,
            applied.from,
            applied.to,
            index,
            previous?.next ?? null,
          ],
    async (key) => {
      const [, , userId, from, to, , before] = key
      const result = await getAdminTeamActivity({ userId, from, to, ...(before ? { before } : {}) })
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    { persistSize: false, revalidateOnFocus: false, keepPreviousData: false }
  )
  const rows = [
      ...new Map((data ?? []).flatMap((page) => page.entries).map((row) => [row.id, row])).values(),
    ],
    first = data?.[0]
  return (
    <Dialog
      open={!!member}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-3xl">
        <DialogTitle>{member?.name}'s recorded work</DialogTitle>
        <DialogDescription>
          Audit actions recorded by this team member. This is an activity history, not an attendance or
          work-quality score. Dates include full days in East Africa Time.
        </DialogDescription>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault()
            setApplied(draft)
          }}
        >
          <label className="text-sm">
            From date
            <Input
              aria-label="Activity from date"
              type="date"
              required
              value={draft.from}
              onChange={(event) => setDraft({ ...draft, from: event.target.value })}
            />
          </label>
          <label className="text-sm">
            To date
            <Input
              aria-label="Activity to date"
              type="date"
              required
              min={draft.from}
              value={draft.to}
              onChange={(event) => setDraft({ ...draft, to: event.target.value })}
            />
          </label>
          <Button className="self-end" disabled={isValidating}>
            Apply dates
          </Button>
        </form>
        {error && (
          <div role="alert" className="rounded-xl border border-red-200 p-4 text-sm text-red-800">
            <p>{error instanceof Error ? error.message : "Activity could not load."}</p>
            <Button variant="outline" className="mt-3" onClick={() => void mutate()}>
              Retry activity
            </Button>
          </div>
        )}
        {isLoading && (
          <p role="status" className="p-5 text-sm">
            Loading recorded work...
          </p>
        )}
        {first && (
          <div className="grid gap-3 rounded-xl bg-muted p-4 sm:grid-cols-3">
            <div>
              <strong className="text-xl">{first.total}</strong>
              <p className="mt-1 text-xs text-muted-foreground">Actions in selected dates</p>
            </div>
            <div>
              <p className="text-sm font-semibold">
                {first.member.jobTitle || first.member.role.replaceAll("_", " ")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {first.member.department || "Department not set"}
              </p>
            </div>
            <Button
              variant="outline"
              className="self-center"
              disabled={isValidating}
              onClick={() => void mutate()}
            >
              Refresh history
            </Button>
          </div>
        )}
        <ol className="max-h-[42dvh] space-y-2 overflow-y-auto">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4"
            >
              <div>
                <p className="break-words text-sm font-semibold">{row.action.replace(/[._]/g, " ")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{row.entityType}</p>
              </div>
              <time dateTime={row.createdAt} className="text-xs text-muted-foreground">
                {new Date(row.createdAt).toLocaleString("en-KE", {
                  timeZone: "Africa/Nairobi",
                  dateStyle: "medium",
                  timeStyle: "short",
                })}{" "}
                EAT
              </time>
            </li>
          ))}
        </ol>
        {!isLoading && !error && first && !rows.length && (
          <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            No recorded actions in these dates. A missing audit entry does not prove no work was done.
          </p>
        )}
        {data?.at(-1)?.next && (
          <Button variant="outline" disabled={isValidating} onClick={() => void setSize(size + 1)}>
            {isValidating ? "Loading..." : "Load older actions"}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
