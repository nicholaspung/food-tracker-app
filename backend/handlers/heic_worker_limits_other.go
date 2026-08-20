//go:build !linux

package handlers

import "runtime/debug"

const heicWorkerGoMemoryLimit = 512 << 20

func applyHEICWorkerResourceLimits() error {
	debug.SetMemoryLimit(heicWorkerGoMemoryLimit)
	return nil
}
