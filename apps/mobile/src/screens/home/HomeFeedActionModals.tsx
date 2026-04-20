import {
  ConfirmDestructiveModal,
  OptionList,
  OptionListRow,
  PhotoViewerModal,
  ReportContentModal,
} from '../../components/shared';
import { createThemedStyles, useTheme } from '../../theme';
import { View } from 'react-native';
import { Modal } from '../../ui';
import type { HomeFeedActionController } from './useHomeFeedActionController';

interface HomeFeedActionModalsProps {
  controller: HomeFeedActionController;
  isOnline: boolean;
}

const useStyles = createThemedStyles((theme) => ({
  deleteConfirmationModalSentinel: {
    backgroundColor: theme.colors.background.surface,
    height: 2,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 2,
    zIndex: 1,
  },
  reportActionTitle: {
    color: theme.colors.text.danger,
  },
}));

export function HomeFeedActionModals({
  controller,
  isOnline,
}: HomeFeedActionModalsProps) {
  const theme = useTheme();
  const styles = useStyles();

  return (
    <>
      <PhotoViewerModal
        initialIndex={controller.photoViewerInitialIndex}
        onRequestClose={controller.closePhotoViewer}
        previewUrls={controller.photoViewerPreviewUrls}
        urls={controller.photoViewerUrls}
        visible={controller.isPhotoViewerVisible}
      />
      <Modal
        description={
          controller.pendingReportMenuTarget?.itemName?.trim()
            ? `Choose an action for "${controller.pendingReportMenuTarget.itemName.trim()}".`
            : controller.pendingReportMenuTarget?.kind === 'food-product'
              ? 'Choose an action for this food product.'
              : 'Choose an action for this visit.'
        }
        onRequestClose={controller.closeReportMenu}
        secondaryAction={{
          accessibilityLabel: 'Cancel',
          label: 'Cancel',
          onPress: controller.closeReportMenu,
          testID: 'home-feed-actions-modal-cancel-button',
        }}
        testID="home-feed-actions-modal"
        title={
          controller.pendingReportMenuTarget?.kind === 'food-product'
            ? 'Food Product Actions'
            : 'Visit Actions'
        }
        visible={controller.pendingReportMenuTarget !== null}
      >
        <OptionList>
          <OptionListRow
            accessibilityLabel={
              controller.pendingReportMenuTarget?.kind === 'food-product'
                ? 'Report food product'
                : 'Report visit'
            }
            iconColor={theme.colors.text.danger}
            iconName="flag-outline"
            isLast
            onPress={controller.openReportModalFromMenu}
            testID="home-feed-actions-modal-report-button"
            title={
              controller.pendingReportMenuTarget?.kind === 'food-product'
                ? 'Report Food Product'
                : 'Report Visit'
            }
            titleStyle={styles.reportActionTitle}
          />
        </OptionList>
      </Modal>
      <ReportContentModal
        contentLabel={
          controller.pendingReportTarget?.itemName?.trim() ||
          (controller.pendingReportTarget?.kind === 'visit'
            ? 'Visit'
            : 'Food Product')
        }
        contentType={
          controller.pendingReportTarget?.kind === 'food-product' ? 'quick-track' : 'visit'
        }
        errorMessage={controller.reportErrorMessage}
        isOnline={isOnline}
        isSubmitting={controller.isSubmittingReport}
        notes={controller.reportNotes}
        onCancel={controller.closeReportModal}
        onChangeNotes={controller.changeReportNotes}
        onChangeReasonCode={controller.changeReportReasonCode}
        onSubmit={() => {
          void controller.submitReport();
        }}
        selectedReasonCode={controller.reportReasonCode}
        testID="home-report-content-modal"
        visible={controller.pendingReportTarget !== null}
      />
      <ConfirmDestructiveModal
        cancelLabel={
          controller.pendingDeleteTarget?.kind === 'visit'
            ? 'Keep Visit'
            : 'Keep Food Product'
        }
        confirmLabel={
          controller.pendingDeleteTarget?.kind === 'visit'
            ? 'Delete Visit'
            : 'Delete Food Product'
        }
        confirmLoadingLabel="Deleting..."
        description={
          controller.pendingDeleteTarget?.kind === 'visit'
            ? controller.pendingDeleteTarget.itemName.trim()
              ? `Delete your visit for "${controller.pendingDeleteTarget.itemName}"? This removes the visit and all associated items/photos.`
              : 'Delete this visit? This removes the visit and all associated items/photos.'
            : controller.pendingDeleteTarget?.itemName?.trim()
              ? `Delete "${controller.pendingDeleteTarget.itemName}"? This will permanently remove the food product.`
              : 'Delete this food product? This will permanently remove the food product.'
        }
        disabled={!controller.pendingDeleteTarget}
        loading={controller.isDeletingTarget}
        onCancel={controller.closeDeleteModal}
        onConfirm={() => {
          void controller.confirmDeleteTarget();
        }}
        testID={
          controller.pendingDeleteTarget?.kind === 'visit'
            ? 'home-delete-visit-confirmation-modal'
            : 'home-delete-food-product-confirmation-modal'
        }
        title={
          controller.pendingDeleteTarget?.kind === 'visit'
            ? 'Delete Visit?'
            : 'Delete Food Product?'
        }
        visible={controller.pendingDeleteTarget !== null}
      >
        {controller.pendingDeleteTarget?.kind === 'visit' ? (
          <View
            collapsable={false}
            pointerEvents="none"
            style={styles.deleteConfirmationModalSentinel}
            testID="home-delete-confirmation-open"
          />
        ) : null}
      </ConfirmDestructiveModal>
    </>
  );
}
