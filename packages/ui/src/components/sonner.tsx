/* eslint-disable react-refresh/only-export-components */
import { Toaster as Sonner, toast } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      expand={false}
      richColors={false}
      position="top-center"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "rounded-3xl border border-border/70 bg-background/95 text-foreground shadow-lg backdrop-blur",
          title: "text-sm font-medium text-foreground",
          description: "text-sm text-muted-foreground",
          closeButton:
            "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
          actionButton:
            "bg-primary text-primary-foreground hover:bg-primary/90",
          cancelButton:
            "bg-secondary text-secondary-foreground hover:bg-secondary/90",
          success:
            "border-emerald-500/20 bg-emerald-500/10 text-foreground",
          error:
            "border-destructive/20 bg-destructive/10 text-foreground",
          info:
            "border-border/70 bg-background/95 text-foreground",
          warning:
            "border-amber-500/20 bg-amber-500/10 text-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster, toast }
