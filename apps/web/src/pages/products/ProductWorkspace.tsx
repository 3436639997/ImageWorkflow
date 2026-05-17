import { useCallback, useEffect, useMemo, useState } from "react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"

import { GeneratePage } from "../GeneratePage"
import { LogsPage } from "../LogsPage"
import { OutputsPage } from "../OutputsPage"
import { productClient, type ProductDetail } from "../../core/product-client"
import type { ProductTab, Product } from "../../core/types"
import { useMessage } from "../../shared/message.tsx"
import { ProductAssetsPanel } from "./ProductAssetsPanel"
import { ProductFormDialog } from "./ProductFormDialog"
import { ProductHeader } from "./ProductHeader"
import { detailToForm } from "./product-form"
import { toMessage } from "./helpers"
import { Empty } from "./shared"

const TABS: Array<{ key: ProductTab; label: string }> = [
  { key: "assets", label: "素材" },
  { key: "generate", label: "生成" },
  { key: "outputs", label: "结果" },
  { key: "logs", label: "日志" },
]

export function ProductWorkspace({
  selectedId,
  products,
  productTab,
  onChangeTab,
  onProductsChange,
  onSelect,
}: {
  selectedId: string
  products: Product[]
  productTab: ProductTab
  onChangeTab: (tab: ProductTab) => void
  onProductsChange: () => void
  onSelect: (id: string) => void
}) {
  const [detail, setDetail] = useState<ProductDetail | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const notify = useMessage()

  const reloadDetail = useCallback(async () => {
    if (!selectedId) {
      setDetail(null)
      return
    }
    try {
      const data = await productClient.get(selectedId)
      setDetail(data)
    } catch (error) {
      notify.error(toMessage(error))
    }
  }, [selectedId, notify])

  useEffect(() => {
    void reloadDetail()
  }, [reloadDetail])

  const handleAssetsChanged = useCallback(() => {
    onProductsChange()
    void reloadDetail()
  }, [onProductsChange, reloadDetail])

  const handleSaved = useCallback(
    (savedId: string) => {
      setEditOpen(false)
      onProductsChange()
      onSelect(savedId)
      void reloadDetail()
    },
    [onProductsChange, onSelect, reloadDetail]
  )

  const handleDeleted = useCallback(() => {
    onProductsChange()
    onSelect("")
    setDetail(null)
  }, [onProductsChange, onSelect])

  const initialForm = useMemo(
    () => (detail ? detailToForm(detail) : null),
    [detail]
  )

  if (!selectedId) {
    return (
      <div className="flex h-full items-center justify-center p-10">
        <Empty text="请先在左侧选择产品，或点「新建」创建一个新产品" />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-5">
      {detail ? (
        <ProductHeader
          detail={detail}
          onEdit={() => setEditOpen(true)}
          onDeleted={handleDeleted}
        />
      ) : null}

      <Tabs
        value={productTab}
        onValueChange={(v) => onChangeTab(v as ProductTab)}
        className="flex min-h-0 flex-1 flex-col gap-3"
      >
        <TabsList className="self-start">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <TabsContent value="assets" className="mt-0">
            <ProductAssetsPanel detail={detail} onChange={handleAssetsChanged} />
          </TabsContent>
          <TabsContent value="generate" className="mt-0">
            <GeneratePage products={products} selectedId={selectedId} />
          </TabsContent>
          <TabsContent value="outputs" className="mt-0">
            <OutputsPage products={products} selectedId={selectedId} />
          </TabsContent>
          <TabsContent value="logs" className="mt-0">
            <LogsPage productId={selectedId} />
          </TabsContent>
        </div>
      </Tabs>

      {initialForm ? (
        <ProductFormDialog
          open={editOpen}
          mode="edit"
          initialForm={initialForm}
          onOpenChange={setEditOpen}
          onSaved={handleSaved}
        />
      ) : null}
    </div>
  )
}
