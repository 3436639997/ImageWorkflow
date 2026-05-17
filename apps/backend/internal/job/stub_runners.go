package job

import (
	"context"
	"log"
	"time"
)

// RegisterStubRunners attaches placeholder implementations for the four
// generation actions. They will be replaced by the real pipeline in Phase 4.
func RegisterStubRunners(svc *Service) {
	svc.Register("dry-run", stubRunner("dry-run", 800*time.Millisecond))
	svc.Register("analyze", stubRunner("analyze", 1500*time.Millisecond))
	svc.Register("render", stubRunner("render", 2000*time.Millisecond))
	svc.Register("generate", stubRunner("generate", 2500*time.Millisecond))
}

func stubRunner(label string, total time.Duration) Runner {
	return func(ctx context.Context, j *Job, logger *log.Logger) (map[string]interface{}, error) {
		steps := 4
		stepDur := total / time.Duration(steps)
		for i := 1; i <= steps; i++ {
			select {
			case <-ctx.Done():
				logger.Printf("[%s] aborted: %v", label, ctx.Err())
				return nil, ctx.Err()
			case <-time.After(stepDur):
			}
			logger.Printf("[%s] step %d/%d for %s", label, i, steps, j.ProductID)
		}
		return map[string]interface{}{
			"ok":      true,
			"stub":    true,
			"action":  label,
			"product": j.ProductID,
		}, nil
	}
}
