package handlers

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	"io"
	"os"
	"os/exec"
	"strconv"
	"time"

	"github.com/jdeng/goheif"
)

const (
	heicWorkerCommand                  = "heic-conversion-worker"
	maxHEICDimension                   = 8192
	maxHEICPixels                      = 50_000_000
	maxHEICJPEGBytes             int64 = 64 << 20
	maxConcurrentHEICConversions       = 2
	heicConversionTimeout              = 30 * time.Second
)

var (
	errInvalidHEICInput = errors.New("invalid HEIC input")
	heicConversionSlots = make(chan struct{}, maxConcurrentHEICConversions)
)

type heicDecodeConfigFunc func(io.Reader) (image.Config, error)
type heicDecodeFunc func(io.Reader) (image.Image, error)

func inspectHEICGeometry(data []byte) (image.Config, error) {
	config, err := goheif.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return image.Config{}, fmt.Errorf("%w: unreadable image metadata", errInvalidHEICInput)
	}
	if err := validateHEICGeometry(config.Width, config.Height); err != nil {
		return image.Config{}, err
	}
	return config, nil
}

func validateHEICGeometry(width int, height int) error {
	if width <= 0 || height <= 0 {
		return fmt.Errorf("%w: image dimensions must be positive", errInvalidHEICInput)
	}
	if width > maxHEICDimension || height > maxHEICDimension {
		return fmt.Errorf("%w: image dimensions exceed %d pixels per axis", errInvalidHEICInput, maxHEICDimension)
	}
	if height > maxHEICPixels/width {
		return fmt.Errorf("%w: image dimensions exceed %d total pixels", errInvalidHEICInput, maxHEICPixels)
	}
	return nil
}

func acquireHEICConversionSlot(ctx context.Context, slots chan struct{}) error {
	select {
	case slots <- struct{}{}:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func releaseHEICConversionSlot(slots chan struct{}) {
	<-slots
}

func runHEICConversionWorker(ctx context.Context, data []byte, expected image.Config) ([]byte, error) {
	executable, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("resolve HEIC worker executable: %w", err)
	}

	command := exec.CommandContext(
		ctx,
		executable,
		heicWorkerCommand,
		strconv.Itoa(expected.Width),
		strconv.Itoa(expected.Height),
	)
	command.Stdin = bytes.NewReader(data)
	output := newBoundedBuffer(maxHEICJPEGBytes)
	stderr := newBoundedBuffer(64 << 10)
	command.Stdout = output
	command.Stderr = stderr

	if err := command.Run(); err != nil {
		if ctx.Err() != nil {
			return nil, fmt.Errorf("HEIC worker deadline: %w", ctx.Err())
		}
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) && exitErr.ExitCode() == 2 {
			return nil, fmt.Errorf("%w: worker rejected image", errInvalidHEICInput)
		}
		return nil, fmt.Errorf("HEIC worker failed: %w: %s", err, stderr.String())
	}

	return bytes.Clone(output.Bytes()), nil
}

// RunHEICConversionWorker handles the private child-process mode used to isolate
// native HEIC decoding from the long-running API process.
func RunHEICConversionWorker(args []string, stdin io.Reader, stdout io.Writer, stderr io.Writer) (handled bool, exitCode int) {
	if len(args) < 2 || args[1] != heicWorkerCommand {
		return false, 0
	}
	if len(args) != 4 {
		fmt.Fprintln(stderr, "invalid HEIC worker arguments")
		return true, 2
	}

	expectedWidth, widthErr := strconv.Atoi(args[2])
	expectedHeight, heightErr := strconv.Atoi(args[3])
	if widthErr != nil || heightErr != nil || validateHEICGeometry(expectedWidth, expectedHeight) != nil {
		fmt.Fprintln(stderr, "invalid HEIC worker geometry")
		return true, 2
	}
	if err := applyHEICWorkerResourceLimits(); err != nil {
		fmt.Fprintf(stderr, "failed to apply HEIC worker resource limits: %v\n", err)
		return true, 1
	}

	data, err := io.ReadAll(io.LimitReader(stdin, maxImageUploadBytes+1))
	if err != nil || int64(len(data)) > maxImageUploadBytes {
		fmt.Fprintln(stderr, "invalid HEIC worker input")
		return true, 2
	}

	expected := image.Config{Width: expectedWidth, Height: expectedHeight}
	if err := convertHEICToJPEG(data, expected, stdout, goheif.DecodeConfig, goheif.Decode); err != nil {
		fmt.Fprintln(stderr, err)
		return true, 2
	}
	return true, 0
}

func convertHEICToJPEG(
	data []byte,
	expected image.Config,
	output io.Writer,
	decodeConfig heicDecodeConfigFunc,
	decode heicDecodeFunc,
) error {
	config, err := decodeConfig(bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("%w: unreadable image metadata", errInvalidHEICInput)
	}
	if err := validateHEICGeometry(config.Width, config.Height); err != nil {
		return err
	}
	if config.Width != expected.Width || config.Height != expected.Height {
		return fmt.Errorf("%w: image metadata changed before decode", errInvalidHEICInput)
	}

	decoded, err := decode(bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("%w: native decode failed", errInvalidHEICInput)
	}
	decodedBounds := decoded.Bounds()
	if decodedBounds.Dx() != config.Width || decodedBounds.Dy() != config.Height {
		return fmt.Errorf("%w: decoded dimensions do not match image metadata", errInvalidHEICInput)
	}

	if err := jpeg.Encode(&boundedWriter{writer: output, remaining: maxHEICJPEGBytes}, decoded, &jpeg.Options{Quality: 90}); err != nil {
		return fmt.Errorf("%w: JPEG output exceeded its safe limit", errInvalidHEICInput)
	}
	return nil
}

type boundedWriter struct {
	writer    io.Writer
	remaining int64
}

func (writer *boundedWriter) Write(data []byte) (int, error) {
	if int64(len(data)) > writer.remaining {
		return 0, fmt.Errorf("output exceeds byte limit")
	}
	written, err := writer.writer.Write(data)
	writer.remaining -= int64(written)
	return written, err
}

type boundedBuffer struct {
	buffer bytes.Buffer
	limit  int64
}

func newBoundedBuffer(limit int64) *boundedBuffer {
	return &boundedBuffer{limit: limit}
}

func (buffer *boundedBuffer) Write(data []byte) (int, error) {
	if int64(buffer.buffer.Len())+int64(len(data)) > buffer.limit {
		return 0, fmt.Errorf("output exceeds byte limit")
	}
	return buffer.buffer.Write(data)
}

func (buffer *boundedBuffer) Bytes() []byte {
	return buffer.buffer.Bytes()
}

func (buffer *boundedBuffer) String() string {
	return buffer.buffer.String()
}
