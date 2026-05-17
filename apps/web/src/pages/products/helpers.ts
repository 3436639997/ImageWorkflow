// Non-component shared helpers for the product pages. Kept in a .ts file
// (instead of co-located in shared.tsx) so that `react-refresh/only-export-components`
// is satisfied for the .tsx files that only export components.

export function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const idx = result.indexOf(",")
      resolve(idx >= 0 ? result.slice(idx + 1) : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
