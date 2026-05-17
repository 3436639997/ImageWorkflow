import { DeleteOutput, ListOutputs } from "../wailsjs/wailsjs/go/output/Service"
import type { OutputFile } from "./types"

export const outputClient = {
	async list(productId: string): Promise<OutputFile[]> {
		const items = await ListOutputs(productId)
		return items.map((item) => ({
			id: item.id,
			filename: item.filename,
			kind: item.kind as OutputFile["kind"],
			size: item.size,
			updatedAt: item.updatedAt,
		}))
	},
	delete(productId: string, filename: string): Promise<void> {
		return DeleteOutput(productId, filename)
	},
}
