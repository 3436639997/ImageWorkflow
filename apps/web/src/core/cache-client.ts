import {
	CacheFilePath,
	ClearCaches,
	ClearGroup,
	ListCaches,
	PlanFor,
	ReadCacheFile,
	WriteCacheFile,
} from "../wailsjs/wailsjs/go/cache/Service"
import type { CacheItem } from "./types"

export const cacheClient = {
	async list(): Promise<CacheItem[]> {
		const items = await ListCaches()
		return items.map((item) => ({
			filename: item.filename,
			group: item.group as CacheItem["group"],
			size: item.size,
			updatedAt: item.updatedAt,
		}))
	},
	read(filename: string): Promise<string> {
		return ReadCacheFile(filename)
	},
	planFor(productId: string): Promise<string> {
		return PlanFor(productId)
	},
	clear(filenames: string[]): Promise<string[]> {
		return ClearCaches(filenames)
	},
	clearGroup(group: string): Promise<string[]> {
		return ClearGroup(group)
	},
	write(filename: string, content: string): Promise<void> {
		return WriteCacheFile(filename, content)
	},
	pathOf(filename: string): Promise<string> {
		return CacheFilePath(filename)
	},
}
