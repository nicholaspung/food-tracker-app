import React from 'react';
import { act, create } from 'react-test-renderer';

import { CreateVisitReviewStep } from '../screens/createVisit/CreateVisitReviewStep';

const mockReact = React;

jest.mock('../components/shared', () => ({
  ConfirmDestructiveModal: ({
    children,
    ...props
  }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('ConfirmDestructiveModal', props, children),
  EmptyState: (props: Record<string, unknown>) =>
    mockReact.createElement('EmptyState', props),
  LightweightStatusCard: ({ message, ...props }: Record<string, unknown> & { message?: React.ReactNode }) =>
    mockReact.createElement(
      'LightweightStatusCard',
      props,
      mockReact.createElement('Text', { tone: 'warning' }, message),
    ),
  OFFLINE_USAGE_WARNING_MESSAGE: 'Offline estimate may be stale. Backend limits are enforced when sync runs.',
  PhotoInputField: (props: Record<string, unknown>) =>
    mockReact.createElement('PhotoInputField', props),
  PhotoViewerModal: (props: Record<string, unknown>) =>
    mockReact.createElement('PhotoViewerModal', props),
  RatingLegend: (props: Record<string, unknown>) =>
    mockReact.createElement('RatingLegend', props),
  RatingSelector: (props: Record<string, unknown>) =>
    mockReact.createElement('RatingSelector', props),
  VisitItemRatingCard: ({
    onRequestRemove,
    photoSection,
    removeTestID,
    ...props
  }: Record<string, unknown> & {
    onRequestRemove?: () => void;
    photoSection?: React.ReactNode;
    removeTestID?: string;
  }) =>
    mockReact.createElement(
      'VisitItemRatingCard',
      props,
      photoSection,
      onRequestRemove
        ? mockReact.createElement('RemoveButton', {
            onPress: onRequestRemove,
            testID: removeTestID,
          })
        : null,
    ),
  VisitMetadataCard: (props: Record<string, unknown>) =>
    mockReact.createElement('VisitMetadataCard', props),
}));

jest.mock('../theme', () => ({
  createThemedStyles: () => () => ({}),
  useTheme: () => ({
    colors: {
      text: {
        danger: '#danger',
      },
    },
  }),
}));

jest.mock('../ui', () => ({
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Input: (props: Record<string, unknown>) => mockReact.createElement('Input', props),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

describe('CreateVisitReviewStep', () => {
  const baseProps = {
    detectedVisitDateValue: null,
    displayMaxPhotosPerItem: 1,
    onAttachPhoto: jest.fn(),
    onRemoveDraftItemPhoto: jest.fn(),
    onUpdateDraftItem: jest.fn(),
    onVisitDateChange: jest.fn(),
    onVisitVisibilityChange: jest.fn(),
    photoLoadWarningMessage: null,
    showOfflineUsageWarning: false,
    visitDate: '2026-04-20',
    visitVisibility: 'friends' as const,
  };

  const draftItem = {
    id: 'visit-item-1',
    name: 'Spicy Wontons',
    rating: 4,
    description: '',
    notes: '',
    deletedPhotoIds: [],
    photos: [],
  };

  it('renders hydrated visit item photos and opens the photo viewer with preview and full-size urls', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <CreateVisitReviewStep
          {...baseProps}
          draftItems={[
            {
              ...draftItem,
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

  it('opens a remove confirmation and confirms draft item removal', async () => {
    const onRemoveDraftItem = jest.fn();
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <CreateVisitReviewStep
          {...baseProps}
          allowItemRemoval
          draftItems={[draftItem]}
          onRemoveDraftItem={onRemoveDraftItem}
        />,
      );
    });

    await act(async () => {
      renderer.root.findByProps({
        testID: 'create-visit-remove-item-button-0',
      }).props.onPress();
    });

    const modal = renderer.root.findByType('ConfirmDestructiveModal');
    expect(modal.props).toMatchObject({
      confirmLabel: 'Remove Item',
      description:
        'Remove "Spicy Wontons" from this visit? This item will be removed when you save changes.',
      title: 'Remove Item?',
      visible: true,
    });

    await act(async () => {
      modal.props.onConfirm();
    });

    expect(onRemoveDraftItem).toHaveBeenCalledWith('visit-item-1');
    expect(renderer.root.findByType('ConfirmDestructiveModal').props.visible).toBe(false);
  });

  it('closes the remove confirmation without removing the item on cancel', async () => {
    const onRemoveDraftItem = jest.fn();
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <CreateVisitReviewStep
          {...baseProps}
          allowItemRemoval
          draftItems={[draftItem]}
          onRemoveDraftItem={onRemoveDraftItem}
        />,
      );
    });

    await act(async () => {
      renderer.root.findByProps({
        testID: 'create-visit-remove-item-button-0',
      }).props.onPress();
    });

    await act(async () => {
      renderer.root.findByType('ConfirmDestructiveModal').props.onCancel();
    });

    expect(onRemoveDraftItem).not.toHaveBeenCalled();
    expect(renderer.root.findByType('ConfirmDestructiveModal').props.visible).toBe(false);
  });

  it('does not render remove controls when item removal is disabled', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <CreateVisitReviewStep
          {...baseProps}
          draftItems={[draftItem]}
          onRemoveDraftItem={jest.fn()}
        />,
      );
    });

    expect(
      renderer.root.findAllByProps({
        testID: 'create-visit-remove-item-button-0',
      }),
    ).toHaveLength(0);
  });

  it('renders an empty state when no draft items remain', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <CreateVisitReviewStep
          {...baseProps}
          allowItemRemoval
          draftItems={[]}
          onRemoveDraftItem={jest.fn()}
        />,
      );
    });

    expect(renderer.root.findByType('EmptyState').props).toMatchObject({
      description: 'Add at least one item before saving this visit.',
      title: 'No items selected',
    });
  });

  it('hides photo source actions while preserving existing draft photo attachments', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <CreateVisitReviewStep
          {...baseProps}
          draftItems={[
            {
              ...draftItem,
              photos: [
                {
                  kind: 'new',
                  id: 'draft-photo-1',
                  upload: {
                    uri: 'file:///draft-photo-1.jpg',
                    name: 'draft-photo-1.jpg',
                    mimeType: 'image/jpeg',
                  },
                  thumbnailUri: 'file:///draft-photo-1.jpg',
                  viewerUri: 'file:///draft-photo-1.jpg',
                  labelDate: 'Apr 20, 2026',
                },
              ],
            },
          ]}
          photoActionsHidden
          photoQuotaStatusMessage="Free users can upload up to 100 photos per month. Remaining estimate: 0."
        />,
      );
    });

    const photoInputField = renderer.root.findByType('PhotoInputField');
    expect(photoInputField.props.hideSourceActions).toBe(true);
    expect(photoInputField.props.countLabel).toBe('1/1');
    expect(photoInputField.props.attachments).toEqual([
      expect.objectContaining({
        id: 'draft-photo-1',
        label: 'Apr 20, 2026',
        uri: 'file:///draft-photo-1.jpg',
      }),
    ]);
    expect(photoInputField.props.footerAction.props.children).toBe(
      'Free users can upload up to 100 photos per month. Remaining estimate: 0.',
    );
  });

  it('hides the zero photo count when photo actions are hidden', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <CreateVisitReviewStep
          {...baseProps}
          draftItems={[draftItem]}
          photoActionsHidden
          photoQuotaStatusMessage="Free users can upload up to 100 photos per month. Remaining estimate: 0."
        />,
      );
    });

    const photoInputField = renderer.root.findByType('PhotoInputField');
    expect(photoInputField.props.hideSourceActions).toBe(true);
    expect(photoInputField.props.countLabel).toBeNull();
    expect(photoInputField.props.footerAction.props.children).toBe(
      'Free users can upload up to 100 photos per month. Remaining estimate: 0.',
    );
  });
});
