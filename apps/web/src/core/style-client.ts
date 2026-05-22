import {
	CreateStyle,
	DeleteImage,
	DeleteStyle,
	GenerateStylePrompt,
	GetStyle,
	ListImages,
	ListStyles,
	UpdateStyle,
	UploadImage,
} from "../wailsjs/wailsjs/go/style/Service"
import { style as styleNs } from "../wailsjs/wailsjs/go/models"

export type Style = styleNs.Style
export type StyleInput = styleNs.StyleInput

export const styleClient = {
	list(): Promise<Style[]> {
		return ListStyles()
	},
	get(id: string): Promise<Style> {
		return GetStyle(id)
	},
	create(input: StyleInput): Promise<Style> {
		return CreateStyle(input)
	},
	update(id: string, input: StyleInput): Promise<Style> {
		return UpdateStyle(id, input)
	},
	delete(id: string): Promise<void> {
		return DeleteStyle(id)
	},
	generatePrompt(description: string, imagePaths: string[]): Promise<string> {
		return GenerateStylePrompt(description, imagePaths)
	},
	uploadImage(styleID: string, filename: string, base64Data: string): Promise<void> {
		return UploadImage(styleID, filename, base64Data)
	},
	deleteImage(styleID: string, filename: string): Promise<void> {
		return DeleteImage(styleID, filename)
	},
	listImages(styleID: string): Promise<string[]> {
		return ListImages(styleID)
	},
}
