/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo } from "react"

import { Toaster, toast } from "@workspace/ui/components/sonner"
import { useTheme } from "@/components/theme-provider"

type MessageContextValue = {
  info: (message: string) => void
  success: (message: string) => void
  error: (message: string) => void
}

const MessageContext = createContext<MessageContextValue | null>(null)
let bridge: MessageContextValue | null = null

export function MessageProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme()
  const toasterTheme =
    theme === "system"
      ? document.documentElement.classList.contains("dark")
        ? "dark"
        : "light"
      : theme

  const api = useMemo<MessageContextValue>(
    () => ({
      info(message: string) {
        toast(message)
      },
      success(message: string) {
        toast.success(message)
      },
      error(message: string) {
        toast.error(message)
      },
    }),
    []
  )

  useEffect(() => {
    bridge = api
    return () => {
      if (bridge === api) {
        bridge = null
      }
    }
  }, [api])

  return (
    <MessageContext.Provider value={api}>
      {children}
      <Toaster theme={toasterTheme} />
    </MessageContext.Provider>
  )
}

export function useMessage() {
  const context = useContext(MessageContext)
  if (!context) {
    throw new Error("useMessage must be used within MessageProvider")
  }
  return context
}

export const message = {
  info(text: string) {
    bridge?.info(text)
  },
  success(text: string) {
    bridge?.success(text)
  },
  error(text: string) {
    bridge?.error(text)
  },
}
