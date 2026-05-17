import {
	CreatePreset,
	DeletePreset,
	FetchModels,
	GetSettings,
	ListPresets,
	RenamePreset,
	SaveSettings,
	SetActivePreset,
	TestSettings,
} from "../wailsjs/wailsjs/go/settings/Service"
import { settings as settingsNs } from "../wailsjs/wailsjs/go/models"

export type PresetMeta = settingsNs.PresetMeta

export const settingsClient = {
	list(reveal = false) {
		return GetSettings(reveal)
	},
	save(values: Record<string, string>) {
		return SaveSettings(values)
	},
	test(kind: "analysis" | "image", values: Record<string, string>) {
		return TestSettings(kind, values)
	},
	fetchModels(kind: "analysis" | "image", values: Record<string, string>) {
		return FetchModels(kind, values)
	},
	listPresets(): Promise<PresetMeta[]> {
		return ListPresets() as Promise<PresetMeta[]>
	},
	setActivePreset(id: string) {
		return SetActivePreset(id)
	},
	createPreset(label: string): Promise<PresetMeta[]> {
		return CreatePreset(label) as Promise<PresetMeta[]>
	},
	renamePreset(id: string, label: string): Promise<PresetMeta[]> {
		return RenamePreset(id, label) as Promise<PresetMeta[]>
	},
	deletePreset(id: string): Promise<PresetMeta[]> {
		return DeletePreset(id) as Promise<PresetMeta[]>
	},
}
