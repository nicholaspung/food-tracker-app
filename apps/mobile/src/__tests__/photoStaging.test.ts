/* eslint-disable import/first */

jest.mock('expo-file-system', () => {
  class MockDirectory {
    uri: string;
    exists = true;

    constructor(...parts: (string | MockDirectory)[]) {
      this.uri = parts
        .map((part) => (typeof part === 'string' ? part : part.uri))
        .join('/');
    }

    create = jest.fn();
  }

  class MockFile {
    uri: string;
    exists = true;
    copy = jest.fn((destination: MockFile) => {
      MockFile.copiedTo.push(destination.uri);
    });
    delete = jest.fn(() => {
      MockFile.deleted.push(this.uri);
    });

    static copiedTo: string[] = [];
    static deleted: string[] = [];

    constructor(...parts: (string | MockDirectory | MockFile)[]) {
      this.uri = parts
        .map((part) => (typeof part === 'string' ? part : part.uri))
        .join('/');
    }
  }

  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: {
      document: new MockDirectory('file:///mock/document'),
    },
    __mockFile: MockFile,
  };
});

const mockManipulateAsync = jest.fn(async (
  _uri?: unknown,
  _actions?: unknown,
  _saveOptions?: unknown,
) => ({
  height: 1200,
  uri: 'file:///manipulated/photo.jpg',
  width: 1600,
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: (uri: unknown, actions: unknown, saveOptions: unknown) =>
    mockManipulateAsync(uri, actions, saveOptions),
  SaveFormat: {
    JPEG: 'jpeg',
  },
}));

import {
  cleanupStagedPhotoFiles,
  stageLocalPhotoFile,
} from '../lib/photoStaging';

const mockedFile = jest.requireMock('expo-file-system').File as {
  copiedTo: string[];
  deleted: string[];
};

describe('photoStaging', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(123456789);
    jest.spyOn(Math, 'random').mockReturnValue(0.123456789);
    mockManipulateAsync.mockClear();
    mockManipulateAsync.mockResolvedValue({
      height: 1200,
      uri: 'file:///manipulated/photo.jpg',
      width: 1600,
    });
    mockedFile.copiedTo.length = 0;
    mockedFile.deleted.length = 0;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stages a resized jpeg photo into app-owned document storage', async () => {
    const staged = await stageLocalPhotoFile({
      uri: 'file:///picker/photo.jpg',
      fileName: 'photo.jpg',
      height: 3024,
      mimeType: 'image/jpeg',
      width: 4032,
    });

    expect(staged).toEqual({
      uri: 'file:///mock/document/photo-staging/21i3v9-4fzzzxjy-photo.jpg',
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
    });
    expect(mockManipulateAsync).toHaveBeenCalledWith(
      'file:///picker/photo.jpg',
      [{ resize: { width: 1600 } }],
      {
        compress: 0.78,
        format: 'jpeg',
      },
    );
    expect(mockedFile.copiedTo).toEqual([
      'file:///mock/document/photo-staging/21i3v9-4fzzzxjy-photo.jpg',
    ]);
    expect(mockedFile.deleted).toEqual(['file:///manipulated/photo.jpg']);
  });

  it('uses custom resize and jpeg options', async () => {
    const staged = await stageLocalPhotoFile(
      {
        uri: 'file:///picker/menu.png',
        fileName: 'menu.png',
        height: 4096,
        mimeType: 'image/png',
        width: 2048,
      },
      {
        jpegQuality: 0.82,
        maxLongEdge: 2048,
      },
    );

    expect(staged).toEqual({
      uri: 'file:///mock/document/photo-staging/21i3v9-4fzzzxjy-menu.jpg',
      name: 'menu.jpg',
      mimeType: 'image/jpeg',
    });
    expect(mockManipulateAsync).toHaveBeenCalledWith(
      'file:///picker/menu.png',
      [{ resize: { height: 2048 } }],
      {
        compress: 0.82,
        format: 'jpeg',
      },
    );
  });

  it('compresses without resize when the photo is already below the max edge', async () => {
    await stageLocalPhotoFile({
      uri: 'file:///picker/small.jpg',
      fileName: 'small.jpg',
      height: 900,
      mimeType: 'image/jpeg',
      width: 1200,
    });

    expect(mockManipulateAsync).toHaveBeenCalledWith(
      'file:///picker/small.jpg',
      [],
      {
        compress: 0.78,
        format: 'jpeg',
      },
    );
  });

  it('preserves fallback name and normalizes mime type to jpeg', async () => {
    const staged = await stageLocalPhotoFile(
      {
        uri: 'file:///picker/no-extension',
      },
      {
        fallbackPrefix: 'note-photo',
      },
    );

    expect(staged?.name).toBe('note-photo-123456789.jpg');
    expect(staged?.mimeType).toBe('image/jpeg');
  });

  it('returns null for an empty uri', async () => {
    await expect(stageLocalPhotoFile({ uri: '   ' })).resolves.toBeNull();
    expect(mockManipulateAsync).not.toHaveBeenCalled();
  });

  it('returns null when manipulation fails', async () => {
    mockManipulateAsync.mockRejectedValueOnce(new Error('failed to manipulate'));

    await expect(
      stageLocalPhotoFile({
        uri: 'file:///picker/photo.jpg',
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
      }),
    ).resolves.toBeNull();

    expect(mockedFile.copiedTo).toEqual([]);
  });

  it('cleans staged files best effort', async () => {
    await expect(
      cleanupStagedPhotoFiles([
        { uri: 'file:///mock/document/photo-staging/photo.jpg' },
        { uri: 'file:///other/photo.jpg' },
        {},
      ]),
    ).resolves.toBeUndefined();

    expect(mockedFile.deleted).toEqual([
      'file:///mock/document/photo-staging/photo.jpg',
    ]);
  });
});
