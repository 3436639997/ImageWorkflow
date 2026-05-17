import type { ProductDetail } from "../../core/product-client"

export type ProductFormMode = "create" | "edit"

export type ProductFormState = {
  product_id: string
  name: string
  category: string
  description: string
  keywords: string
  colors_text: string
  hero_color: string
  color_image_map: string
  detail_image_count: number
  notes: string
}

export const EMPTY_PRODUCT_FORM: ProductFormState = {
  product_id: "",
  name: "",
  category: "",
  description: "",
  keywords: "",
  colors_text: "",
  hero_color: "",
  color_image_map: "",
  detail_image_count: 2,
  notes: "",
}

export function detailToForm(detail: ProductDetail): ProductFormState {
  return {
    product_id: detail.product_id,
    name: detail.name,
    category: detail.category,
    description: detail.description,
    keywords: detail.keywords,
    colors_text: detail.colors_text,
    hero_color: detail.hero_color,
    color_image_map: detail.color_image_map,
    detail_image_count: detail.detail_image_count || 2,
    notes: detail.notes,
  }
}
