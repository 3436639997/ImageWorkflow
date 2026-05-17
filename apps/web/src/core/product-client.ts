import {
	DeleteProduct,
	DeleteProductImage,
	GetProduct,
	ListProducts,
	SaveProduct,
	UploadProductImage,
	UploadProductImageFromPath,
} from "../wailsjs/wailsjs/go/product/Service"
import { product } from "../wailsjs/wailsjs/go/models"
import type { Product } from "./types"

export type ProductDetail = product.ProductDetail
export type ProductImage = product.ProductImage

export type ProductCreateInput = {
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

function toLightProduct(p: product.Product): Product {
	return {
		product_id: p.product_id,
		name: p.name,
		category: p.category,
		image_count: p.image_count,
		has_plan: p.has_plan,
		output_count: p.output_count,
	}
}

export const productClient = {
	async list(): Promise<Product[]> {
		const items = await ListProducts()
		return items.map(toLightProduct)
	},
	async listFull(): Promise<product.Product[]> {
		return ListProducts()
	},
	get(productId: string): Promise<ProductDetail> {
		return GetProduct(productId)
	},
	save(input: ProductCreateInput): Promise<ProductDetail> {
		const payload = product.Product.createFrom({
			...input,
			image_count: 0,
			has_plan: false,
			output_count: 0,
		})
		return SaveProduct(payload)
	},
	delete(productId: string): Promise<void> {
		return DeleteProduct(productId)
	},
	uploadImage(productId: string, filename: string, base64Data: string): Promise<ProductImage> {
		return UploadProductImage(productId, filename, base64Data)
	},
	uploadImageFromPath(productId: string, srcPath: string): Promise<ProductImage> {
		return UploadProductImageFromPath(productId, srcPath)
	},
	deleteImage(productId: string, filename: string): Promise<void> {
		return DeleteProductImage(productId, filename)
	},
}
