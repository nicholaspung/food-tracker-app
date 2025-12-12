import { create } from "zustand";
import { ScreenState, ProcessType } from "@/types/photos";

/**
 * Zustand store for photo processing workflow state
 *
 * Manages:
 * - Current screen and process type
 * - Navigation between screens
 * - Fullscreen photo viewer
 * - Camera mode
 */
interface PhotoProcessingStore {
  // Screen navigation
  screen: ScreenState;
  processType: ProcessType | null;
  setScreen: (screen: ScreenState) => void;
  setProcessType: (type: ProcessType | null) => void;

  // Fullscreen photo viewer
  fullscreenPhoto: {
    url: string;
    dishName: string;
  } | null;
  setFullscreenPhoto: (
    photo: { url: string; dishName: string } | null
  ) => void;

  // Camera mode for restaurant name detection
  showCameraMode: boolean;
  setShowCameraMode: (show: boolean) => void;

  // Dialog state
  showBackDialog: boolean;
  backDialogType: "upload" | "cancel";
  setShowBackDialog: (show: boolean, type?: "upload" | "cancel") => void;

  showRequiredFieldsDialog: boolean;
  setShowRequiredFieldsDialog: (show: boolean) => void;

  // Reset all state
  reset: () => void;
}

export const usePhotoProcessingStore = create<PhotoProcessingStore>((set) => ({
  // Initial state
  screen: "choice",
  processType: null,
  fullscreenPhoto: null,
  showCameraMode: false,
  showBackDialog: false,
  backDialogType: "cancel",
  showRequiredFieldsDialog: false,

  // Actions
  setScreen: (screen) => set({ screen }),
  setProcessType: (type) => set({ processType: type }),
  setFullscreenPhoto: (photo) => set({ fullscreenPhoto: photo }),
  setShowCameraMode: (show) => set({ showCameraMode: show }),
  setShowBackDialog: (show, type = "cancel") =>
    set({ showBackDialog: show, backDialogType: type }),
  setShowRequiredFieldsDialog: (show) =>
    set({ showRequiredFieldsDialog: show }),

  reset: () =>
    set({
      screen: "choice",
      processType: null,
      fullscreenPhoto: null,
      showCameraMode: false,
      showBackDialog: false,
      backDialogType: "cancel",
      showRequiredFieldsDialog: false,
    }),
}));
