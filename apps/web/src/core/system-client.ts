import {
	GetFileServerPort,
	OpenImageFiles,
	OpenInEditor,
	OpenInFileManager,
	OpenOutputFolder,
	OpenProductFolder,
	OpenWorkspace,
	PickDirectory,
	RuntimeInfo,
} from "../wailsjs/wailsjs/go/system/Service"

export const systemClient = {
	getFileServerPort(): Promise<number> {
		return GetFileServerPort()
	},
	openImageFiles(): Promise<string[]> {
		return OpenImageFiles()
	},
	openInFileManager(path: string): Promise<void> {
		return OpenInFileManager(path)
	},
	openInEditor(path: string): Promise<void> {
		return OpenInEditor(path)
	},
	openProductFolder(productId: string): Promise<void> {
		return OpenProductFolder(productId)
	},
	openOutputFolder(productId: string): Promise<void> {
		return OpenOutputFolder(productId)
	},
	openWorkspace(): Promise<void> {
		return OpenWorkspace()
	},
	pickDirectory(title: string): Promise<string> {
		return PickDirectory(title)
	},
	runtimeInfo() {
		return RuntimeInfo()
	},
}
