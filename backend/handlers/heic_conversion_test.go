package handlers

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"image"
	"io"
	"testing"

	"github.com/jdeng/goheif"
)

const normalHEICFixtureBase64 = "AAAAJGZ0eXBoZWljAAAAAG1pZjFNaVBybWlhZk1pSEJoZWljAAABw21ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAHBpY3QAAAAAAAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAADnBpdG0AAAAAAAEAAAA4aWluZgAAAAAAAgAAABVpbmZlAgAAAAABAABodmMxAAAAABVpbmZlAgAAAQACAABFeGlmAAAAABppcmVmAAAAAAAAAA5jZHNjAAIAAQABAAAA5mlwcnAAAADFaXBjbwAAABNjb2xybmNseAACAAIABoAAAAAMY2xsaQDLAEAAAAAUaXNwZQAAAAAAAAAQAAAAEAAAAAlpcm90AAAAABBwaXhpAAAAAAMICAgAAABxaHZjQwEDcAAAALAAAAAAAB7wAPz9+PgAAAsDoAABABdAAQwB//8DcAAAAwCwAAADAAADAB5wJKEAAQAjQgEBA3AAAAMAsAAAAwAAAwAeoBQgQcCTDOIe5FlU3AgIGAKiAAEACUQBwGFyyEBTJAAAABlpcG1hAAAAAAAAAAEAAQaBAgMFhoQAAAAsaWxvYwAAAABEAAACAAEAAAABAAACMwAAAO0AAgAAAAEAAAH3AAAAPAAAAAFtZGF0AAAAAAAAATkAAAAGRXhpZgAATU0AKgAAAAgAAwESAAMAAAABAAEAAAFCAAQAAAABAAAGPAFDAAQAAAABAAAEKAAAAAAAAADpKAGvoRnQC4sEIwOKTbfV7NwfdBss2pmR7GIRBJEIfM94lannNfmTrt66D9pJ/feS/v3LcNcmdBg5+U8DdSfvaC50ttuezY7HCg9sFD8bQ9efcVdM+o3Nu4VCO2ITKVMmENgnatOld11TPEyj1qQKGoYqit9XZw8Iv+8fvmANwiMkhjbYm35Kr/3SC5mQdXkw1kzdrb8a4mlI+AbL/HgMie3e8tGLRCY19GWMIvvAu+i+mfVbdWVY+93fwoM044abOn17tE2Ub//2vyHUZ3ocT8sdtv9AMCk+f/8xjWxkg/+oth3E+LSr/8A="

func TestValidateHEICGeometry(t *testing.T) {
	maxInt := int(^uint(0) >> 1)
	tests := []struct {
		name    string
		width   int
		height  int
		wantErr bool
	}{
		{name: "zero width", width: 0, height: 1, wantErr: true},
		{name: "negative height", width: 1, height: -1, wantErr: true},
		{name: "exact axis boundary", width: maxHEICDimension, height: 1},
		{name: "over axis boundary", width: maxHEICDimension + 1, height: 1, wantErr: true},
		{name: "exact pixel boundary", width: 6250, height: 8000},
		{name: "over pixel boundary", width: 6251, height: 8000, wantErr: true},
		{name: "overflow shaped", width: maxInt, height: maxInt, wantErr: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateHEICGeometry(test.width, test.height)
			if (err != nil) != test.wantErr {
				t.Fatalf("validateHEICGeometry(%d, %d) error = %v, wantErr %t", test.width, test.height, err, test.wantErr)
			}
		})
	}
}

func TestConvertHEICToJPEGValidatesBeforeDecode(t *testing.T) {
	decodeCalled := false
	err := convertHEICToJPEG(
		[]byte("fixture"),
		image.Config{Width: 1, Height: 1},
		&bytes.Buffer{},
		func(_ io.Reader) (image.Config, error) {
			return image.Config{Width: 0, Height: 1}, nil
		},
		func(_ io.Reader) (image.Image, error) {
			decodeCalled = true
			return image.NewRGBA(image.Rect(0, 0, 1, 1)), nil
		},
	)

	if !errors.Is(err, errInvalidHEICInput) {
		t.Fatalf("expected invalid HEIC input error, got %v", err)
	}
	if decodeCalled {
		t.Fatal("expected geometry validation to reject input before native decode")
	}
}

func TestConvertHEICToJPEGRejectsDecodedBoundsMismatch(t *testing.T) {
	err := convertHEICToJPEG(
		[]byte("fixture"),
		image.Config{Width: 2, Height: 1},
		&bytes.Buffer{},
		func(_ io.Reader) (image.Config, error) {
			return image.Config{Width: 2, Height: 1}, nil
		},
		func(_ io.Reader) (image.Image, error) {
			return image.NewRGBA(image.Rect(0, 0, 1, 2)), nil
		},
	)

	if !errors.Is(err, errInvalidHEICInput) {
		t.Fatalf("expected decoded bounds mismatch to be rejected, got %v", err)
	}
}

func TestConvertHEICToJPEGConvertsNormalFixture(t *testing.T) {
	heicData, err := base64.StdEncoding.DecodeString(normalHEICFixtureBase64)
	if err != nil {
		t.Fatalf("decode HEIC fixture: %v", err)
	}
	config, err := inspectHEICGeometry(heicData)
	if err != nil {
		t.Fatalf("inspect HEIC fixture: %v", err)
	}

	var output bytes.Buffer
	if err := convertHEICToJPEG(heicData, config, &output, goheif.DecodeConfig, goheif.Decode); err != nil {
		t.Fatalf("convert normal HEIC fixture: %v", err)
	}
	jpegConfig, format, err := image.DecodeConfig(bytes.NewReader(output.Bytes()))
	if err != nil {
		t.Fatalf("decode converted JPEG config: %v", err)
	}
	if format != "jpeg" {
		t.Fatalf("expected JPEG output, got %q", format)
	}
	if jpegConfig.Width != config.Width || jpegConfig.Height != config.Height {
		t.Fatalf("expected converted dimensions %dx%d, got %dx%d", config.Width, config.Height, jpegConfig.Width, jpegConfig.Height)
	}
}

func TestHEICConversionSlotsBoundConcurrency(t *testing.T) {
	slots := make(chan struct{}, 2)
	if err := acquireHEICConversionSlot(context.Background(), slots); err != nil {
		t.Fatalf("acquire first slot: %v", err)
	}
	if err := acquireHEICConversionSlot(context.Background(), slots); err != nil {
		t.Fatalf("acquire second slot: %v", err)
	}

	canceledContext, cancel := context.WithCancel(context.Background())
	cancel()
	if err := acquireHEICConversionSlot(canceledContext, slots); !errors.Is(err, context.Canceled) {
		t.Fatalf("expected full semaphore to wait for context cancellation, got %v", err)
	}

	releaseHEICConversionSlot(slots)
	if err := acquireHEICConversionSlot(context.Background(), slots); err != nil {
		t.Fatalf("acquire released slot: %v", err)
	}
	releaseHEICConversionSlot(slots)
	releaseHEICConversionSlot(slots)
}

func TestBoundedWriterRejectsOversizedOutput(t *testing.T) {
	var destination bytes.Buffer
	writer := &boundedWriter{writer: &destination, remaining: 3}
	if _, err := writer.Write([]byte("ab")); err != nil {
		t.Fatalf("write within limit: %v", err)
	}
	if _, err := writer.Write([]byte("cd")); err == nil {
		t.Fatal("expected oversized write to be rejected")
	}
	if destination.String() != "ab" {
		t.Fatalf("expected rejected bytes not to be buffered, got %q", destination.String())
	}
}
