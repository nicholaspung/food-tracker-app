import React from 'react';
import { act, create } from 'react-test-renderer';

import { CreateVisitReviewStep } from '../screens/createVisit/CreateVisitReviewStep';

const mockReact = React;

jest.mock('../components/shared', () => ({
  PhotoInputField: (props: Record<string, unknown>) =>
    mockReact.createElement('PhotoInputField', props),
  PhotoViewerModal: (props: Record<string, unknown>) =>
    mockReact.createElement('PhotoViewerModal', props),
  RatingLegend: (props: Record<string, unknown>) =>
    mockReact.createElement('RatingLegend', props),
  RatingSelector: (props: Record<string, unknown>) =>
    mockReact.createElement('RatingSelector', props),
  UpgradePromptCard: (props: Record<string, unknown>) =>
    mockReact.createElement('UpgradePromptCard', props),
  VisitMetadataCard: (props: Record<string, unknown>) =>
    mockReact.createElement('VisitMetadataCard', props),
}));

jest.mock('../theme', () => ({
  createThemedStyles: () => () => ({}),
}));

jest.mock('../ui', () => ({
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Input: (props: Record<string, unknown>) => mockReact.createElement('Input', props),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

describe('CreateVisitReviewStep', () => {
  it('renders hydrated visit item photos and opens the photo viewer with preview and full-size urls', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <CreateVisitReviewStep
          detectedVisitDateValue={null}
          displayMaxPhotosPerItem={1}
          draftItems={[
            {
              id: 'visit-item-1',
              name: 'Spicy Wontons',
              rating: 4,
              description: '',
              notes: '',
              deletedPhotoIds: [],
              photos: [
                {
                  kind: 'existing',
                  id: 'photo-1',
                  photoId: 'photo-1',
                  thumbnailUri: 'pb://photo-1/wontons.jpg?thumb=100x100',
                  viewerUri: 'pb://photo-1/wontons.jpg',
                  labelDate: 'Apr 20, 2026',
                },
              ],
            },
          ]}
          estimatedFreeMonthlyPhotosRemaining={3}
          onAttachPhoto={jest.fn()}
          onRemoveDraftItemPhoto={jest.fn()}
          onUpdateDraftItem={jest.fn()}
          onVisitDateChange={jest.fn()}
          onVisitVisibilityChange={jest.fn()}
          photoLoadWarningMessage={null}
          shouldShowPhotoUpgradePrompt={false}
          showOfflineUsageWarning={false}
          showUsageEstimate={false}
          visitDate="2026-04-20"
          visitVisibility="friends"
        />,
      );
    });

    const photoInputField = renderer.root.findByType('PhotoInputField');
    expect(photoInputField.props.attachments).toEqual([
      expect.objectContaining({
        id: 'photo-1',
        label: 'Apr 20, 2026',
        uri: 'pb://photo-1/wontons.jpg?thumb=100x100',
      }),
    ]);

    await act(async () => {
      photoInputField.props.attachments[0].onPress();
    });

    expect(renderer.root.findByType('PhotoViewerModal').props).toMatchObject({
      previewUrls: ['pb://photo-1/wontons.jpg?thumb=100x100'],
      urls: ['pb://photo-1/wontons.jpg'],
      visible: true,
    });
  });
});
