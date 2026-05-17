import { useCallback, useEffect, useState } from "react"

import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"

import { AppSidebar } from "./layout/app-sidebar"
import { productClient } from "./core/product-client"
import type { Product, ProductTab, TopPage } from "./core/types"
import { CachePage } from "./pages/CachePage"
import { ProductsLayout } from "./pages/products/ProductsLayout"
import { SettingsPage } from "./pages/SettingsPage"

export function App() {
  const [topPage, setTopPage] = useState<TopPage>("products")
  const [productTab, setProductTab] = useState<ProductTab>("assets")
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

  return (
    <SidebarProvider defaultOpen>
      <AppSidebar topPage={topPage} onChangePage={setTopPage} />
      <SidebarInset className="h-screen overflow-hidden">
        {topPage === "products" ? (
          <ProductsLayout
            products={products}
            selectedId={selectedId}
            productTab={productTab}
            onSelect={setSelectedId}
            onChangeTab={setProductTab}
            onProductsChange={() => void refreshProducts()}
          />
        ) : topPage === "cache" ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <CachePage />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <SettingsPage />
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  )
}
