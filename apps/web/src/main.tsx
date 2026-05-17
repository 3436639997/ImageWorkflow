import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@workspace/ui/globals.css"
import { App } from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { ConfirmProvider } from "./shared/confirm.tsx"
import { MessageProvider } from "./shared/message.tsx"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <MessageProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </MessageProvider>
    </ThemeProvider>
  </StrictMode>
)
