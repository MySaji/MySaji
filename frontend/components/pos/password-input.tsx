"use client"

import { useState, type ComponentProps } from "react"
import { Eye, EyeOff } from "lucide-react"
import { Input } from "@/frontend/components/ui/input"
import styles from "./auth-frame.module.css"

export function PasswordInput(props: Omit<ComponentProps<typeof Input>, "type">) {
  const [visible, setVisible] = useState(false)
  return <div className={styles.password}>
    <Input {...props} type={visible ? "text" : "password"} />
    <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button>
  </div>
}
