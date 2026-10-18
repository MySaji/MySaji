"use client"

import { Children, Fragment, isValidElement, type ReactNode } from "react"
import { MoreHorizontal } from "lucide-react"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/frontend/components/ui/dropdown-menu"

function items(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap(child => isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment ? items(child.props.children) : [child])
}

export function RowActions({ name, children }: { name: string; children: ReactNode }) {
  return <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label={`Actions for ${name}`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-muted"><MoreHorizontal className="h-4 w-4" /></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-44 [&_[role=menuitem]]:w-full [&_[role=menuitem]]:justify-start [&_[role=menuitem]]:border-0 [&_[role=menuitem]]:rounded-md [&_[role=menuitem]]:text-xs">{items(children).map((child, index) => <DropdownMenuItem asChild key={index}>{child}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
}
