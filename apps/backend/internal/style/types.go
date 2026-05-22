package style

// Style represents a global style reference set.
type Style struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	Prompt          string   `json:"prompt"`
	ReferenceImages []string `json:"reference_images"` // filenames only
	CreatedAt       string   `json:"created_at"`       // ISO 8601
}

// StyleInput is the payload for creating or updating a style.
type StyleInput struct {
	Name   string `json:"name"`
	Prompt string `json:"prompt"`
}
