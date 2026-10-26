"use client"
import { cloneElement,useId,type ReactElement,type ReactNode } from "react"
export const opsInput="min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
export const opsButton="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
export type OpsRun=(work:()=>Promise<void>)=>Promise<void>
export function OpsField({label,children}:{label:string;children:ReactElement<{id?:string}>}){const id=useId();return <div className="grid min-w-0 gap-2 text-sm font-medium"><label htmlFor={id}>{label}</label>{cloneElement(children,{id})}</div>}
export function OpsPanel({title,description,children}:{title:string;description:string;children:ReactNode}){return <section className="space-y-5 rounded-2xl border border-border bg-background p-5 md:p-7"><header><h2 className="text-xl font-semibold">{title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p></header>{children}</section>}
