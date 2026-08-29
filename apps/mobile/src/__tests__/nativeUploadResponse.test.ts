import { parseNativeUploadErrorResponse } from '../features/store/nativeUploadResponse';

describe('parseNativeUploadErrorResponse', () => {
  it('preserves valid JSON objects', () => {
    const response = {
      data: { photo: { message: 'File is too large.' } },
      message: 'Failed to create record.',
    };

    expect(parseNativeUploadErrorResponse(JSON.stringify(response), 'Upload failed.')).toEqual(
      response,
    );
  });

  it.each([
    ['array JSON', '[{"message":"invalid"}]', '[{"message":"invalid"}]'],
    ['string JSON', '"invalid"', '"invalid"'],
    ['number JSON', '42', '42'],
    ['plain text', '  upstream unavailable  ', 'upstream unavailable'],
    ['invalid JSON', '{"message":', '{"message":'],
  ])('uses a well-formed fallback for %s', (_label, body, expectedMessage) => {
    expect(parseNativeUploadErrorResponse(body, 'Upload failed.')).toEqual({
      data: {},
      message: expectedMessage,
    });
  });

  it.each(['', '   '])('uses the caller fallback for an empty body', (body) => {
    expect(parseNativeUploadErrorResponse(body, 'Upload failed.')).toEqual({
      data: {},
      message: 'Upload failed.',
    });
  });
});
