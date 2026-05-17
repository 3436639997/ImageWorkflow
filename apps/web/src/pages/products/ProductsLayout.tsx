import { useEffect, useRef, useState } from "react"

import type { Product, ProductTab } from "../../core/types"
import { ProductFormDialog } from "./ProductFormDialog"
import { ProductListPanel } from "./ProductListPanel"
import { ProductWorkspace } from "./ProductWorkspace"
import { EMPTY_PRODUCT_FORM } from "./product-form"

const STORAGE_KEY = "products-layout-list-width"
const MIN_WIDTH = 220
const MAX_WIDTH = 600
const DEFAULT_WIDTH = 340

function readStoredWidth(): number {
  if (typeof window === "undefined") return DEFAULT_WIDTH
  const raw = window.localStorage.getItem(STORAGE_KEY)
  const n = raw ? Number(raw) : NaN
  if (!Number.isFinite(n)) return DEFAULT_WIDTH
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n))
}

export function ProductsLayout({
  products,
  selectedId,
  productTab,
  onSelect,
  onChangeTab,
  onProductsChange,
}: {
  products: Product[]
  selectedId: string
  productTab: ProductTab
  onSelect: (id: string) => void
  onChangeTab: (tab: ProductTab) => void
  onProductsChange: () => void
}) {
  const [createOpen, setCreateOpen] = useState(false)
  const [listWidth, setListWidth] = useState<number>(() => readStoredWidth())
  const [dragging, setDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  function handleCreated(savedId: string) {
    setCreateOpen(false)
    onProductsChange()
    onSelect(savedId)
  }

  // While dragging, attach window-level listeners that update the column width
  // and end the drag on pointerup. They are self-contained inside the effect
  // so each can reference the other without a circular dependency.
  useEffect(() => {
    if (!dragging) return

    function onPointerMove(e: PointerEvent) {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX - rect.left))
      setListWidth(next)
    }
    function onPointerUp() {
      setDragging(false)
    }

    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)

    return () => {
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
    }
  }, [dragging])

  // Persist the latest width whenever a drag ends.
  useEffect(() => {
    if (dragging) return
    window.localStorage.setItem(STORAGE_KEY, String(listWidth))
  }, [dragging, listWidth])

  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(true)
  }

  function resetWidth() {
    setListWidth(DEFAULT_WIDTH)
    window.localStorage.setItem(STORAGE_KEY, String(DEFAULT_WIDTH))
  }

  return (
    <div
      ref={containerRef}
      className="grid h-full min-h-0"
      style={{ gridTemplateColumns: `${listWidth}px 3px minmax(0,1fr)` }}
    >
      <ProductListPanel
        products={products}
        selectedId={selectedId}
        onSelect={onSelect}
        onCreate={() => setCreateOpen(true)}
      />

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="拖动调整产品列表宽度"
        title="拖动调整宽度，双击重置"
        onPointerDown={startDrag}
        onDoubleClick={resetWidth}
        className="group relative cursor-col-resize select-none bg-transparent transition-colors hover:bg-primary/20"
      >
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border group-hover:bg-primary" />
      </div>

      <div className="min-h-0 overflow-hidden">
        <ProductWorkspace
          selectedId={selectedId}
          products={products}
          productTab={productTab}
          onChangeTab={onChangeTab}
          onProductsChange={onProductsChange}
          onSelect={onSelect}
        />
      </div>

      <ProductFormDialog
        open={createOpen}
        mode="create"
        initialForm={EMPTY_PRODUCT_FORM}
        onOpenChange={setCreateOpen}
        onSaved={handleCreated}
      />
    </div>
  )
}
