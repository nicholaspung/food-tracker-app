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
    mockedFile.copiedTo.length = 0;
    mockedFile.deleted.length = 0;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stages a local photo into app-owned document storage', async () => {
    const staged = await stageLocalPhotoFile({
      uri: 'file:///picker/photo.jpg',
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
    });

    expect(staged).toEqual({
      uri: 'file:///mock/document/photo-staging/21i3v9-4fzzzxjy-photo.jpg',
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
    });
    expect(mockedFile.copiedTo).toEqual([
      'file:///mock/document/photo-staging/21i3v9-4fzzzxjy-photo.jpg',
    ]);
  });

  it('preserves fallback name and mime inference', async () => {
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
