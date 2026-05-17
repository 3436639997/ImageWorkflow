import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@workspace/ui/globals.css"
import { TooltipProvider } from "@workspace/ui/components/tooltip"

import { App } from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { ConfirmProvider } from "./shared/confirm.tsx"
import { MessageProvider } from "./shared/message.tsx"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <TooltipProvider>
        <MessageProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </MessageProvider>
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>
)
