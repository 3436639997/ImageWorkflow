import { useCallback, useEffect, useMemo, useState } from "react"

import { AppShell } from "./layout/shell"
import { productClient } from "./core/product-client"
import type { PageKey, Product } from "./core/types"
import { SettingsPage } from "./pages/SettingsPage"
import { ProductsPage } from "./pages/ProductsPage"
import { GeneratePage } from "./pages/GeneratePage"
import { OutputsPage } from "./pages/OutputsPage"
import { CachePage } from "./pages/CachePage"
import { LogsPage } from "./pages/LogsPage"

export function App() {
  const [page, setPage] = useState<PageKey>("products")
  const [products, setProducts] = useState<Product[]>([])
  const [selectedId, setSelectedId] = useState("")

  const refreshProducts = useCallback(async () => {
    const data = await productClient.list()
    setProducts(data)
    setSelectedId((current) => {
      if (current && data.some((p) => p.product_id === current)) return current
      return data[0]?.product_id ?? ""
    })
  }, [])

  useEffect(() => {
    void refreshProducts()
  }, [refreshProducts])

  const content = useMemo(() => {
    switch (page) {
      case "settings":
        return <SettingsPage />
      case "products":
        return (
          <ProductsPage
            products={products}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onProductsChange={() => void refreshProducts()}
          />
        )
      case "generate":
        return <GeneratePage products={products} selectedId={selectedId} />
      case "outputs":
        return <OutputsPage products={products} selectedId={selectedId} />
      case "cache":
        return <CachePage />
      case "logs":
        return <LogsPage />
      default:
        return null
    }
  }, [page, products, selectedId, refreshProducts])

  return (
    <AppShell page={page} onChangePage={setPage}>
      {content}
    </AppShell>
  )
}
