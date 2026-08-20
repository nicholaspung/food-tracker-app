//go:build linux

package handlers

import (
	"runtime/debug"
	"syscall"
)

const (
	heicWorkerGoMemoryLimit = 512 << 20
	heicWorkerAddressLimit  = 1536 << 20
	heicWorkerCPULimit      = 25
)

func applyHEICWorkerResourceLimits() error {
	debug.SetMemoryLimit(heicWorkerGoMemoryLimit)
	if err := syscall.Setrlimit(syscall.RLIMIT_AS, &syscall.Rlimit{Cur: heicWorkerAddressLimit, Max: heicWorkerAddressLimit}); err != nil {
		return err
	}
	return syscall.Setrlimit(syscall.RLIMIT_CPU, &syscall.Rlimit{Cur: heicWorkerCPULimit, Max: heicWorkerCPULimit})
}
