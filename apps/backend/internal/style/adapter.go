package style

import "ImageWorkflow/apps/backend/internal/pipeline"

// StyleLoaderAdapter adapts style.Service to pipeline.styleLoader interface.
type StyleLoaderAdapter struct {
	service *Service
}

// NewStyleLoaderAdapter creates an adapter for pipeline integration.
func NewStyleLoaderAdapter(service *Service) *StyleLoaderAdapter {
	return &StyleLoaderAdapter{service: service}
}

// GetStyle implements pipeline.styleLoader interface.
func (a *StyleLoaderAdapter) GetStyle(id string) (pipeline.StyleData, error) {
	style, err := a.service.GetStyle(id)
	if err != nil {
		return pipeline.StyleData{}, err
	}
	return pipeline.StyleData{Prompt: style.Prompt}, nil
}
