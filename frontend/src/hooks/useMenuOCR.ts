import { useState } from 'react';
import {
  performOCR,
  parseMenuItems,
  compressImage,
  uploadMenuImage,
  createMenuItems,
  ExtractedMenuItem,
} from '@/services/ocrService';
import { MenuItem } from '@/lib/pocketbase';

export type OCRStatus = 'idle' | 'preprocessing' | 'compressing' | 'uploading' | 'processing' | 'complete' | 'error';

export interface UseMenuOCRState {
  status: OCRStatus;
  progress: number;
  extractedItems: ExtractedMenuItem[];
  menuItems: MenuItem[];
  error: string | null;
  sourceImageId?: string;
  debugData?: any; // For admin debug view
}

export function useMenuOCR() {
  const [state, setState] = useState<UseMenuOCRState>({
    status: 'idle',
    progress: 0,
    extractedItems: [],
    menuItems: [],
    error: null,
    sourceImageId: undefined,
    debugData: undefined,
  });

  const processMenuImage = async (imageFile: File, restaurantId: string) => {
    try {
      // Step 1: Compress image
      setState({
        status: 'compressing',
        progress: 10,
        extractedItems: [],
        menuItems: [],
        error: null,
        sourceImageId: undefined,
        debugData: undefined,
      });

      const compressedImage = await compressImage(imageFile);

      // Step 2: Perform OCR with real-time progress updates (before uploading)
      setState((prev) => ({
        ...prev,
        status: 'processing',
        progress: 30,
      }));

      const ocrResult = await performOCR(compressedImage, (ocrProgress) => {
        // Map OCR progress (0-1) to our overall progress range (30-60%)
        const mappedProgress = 30 + (ocrProgress * 30);
        setState((prev) => ({
          ...prev,
          progress: Math.round(mappedProgress),
        }));
      });

      // Step 3: Parse menu items from CSV
      setState((prev) => ({
        ...prev,
        progress: 60,
        debugData: ocrResult.debug, // Capture debug data for admins
      }));

      const extracted = parseMenuItems(ocrResult.csv);

      if (extracted.length === 0) {
        throw new Error(
          'No menu items found. Please ensure the image is clear and contains menu text.'
        );
      }

      // Step 4: Upload to PocketBase (only after OCR succeeds)
      setState((prev) => ({
        ...prev,
        status: 'uploading',
        progress: 70,
      }));

      const menuImage = await uploadMenuImage(restaurantId, compressedImage);

      // Step 5: Create menu_items records in database
      setState((prev) => ({
        ...prev,
        progress: 85,
      }));

      const createdItems = await createMenuItems(
        restaurantId,
        extracted,
        menuImage.id,
        { isFromOCR: true } // Mark items as created from OCR
      );

      // Step 6: Complete
      setState({
        status: 'complete',
        progress: 100,
        extractedItems: extracted,
        menuItems: createdItems,
        error: null,
        sourceImageId: menuImage.id,
        debugData: ocrResult.debug, // Keep debug data for admins
      });

      return createdItems;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to process menu image';

      setState((prev) => ({
        ...prev,
        status: 'error',
        error: errorMessage,
      }));

      throw error;
    }
  };

  const reset = () => {
    setState({
      status: 'idle',
      progress: 0,
      extractedItems: [],
      menuItems: [],
      error: null,
      sourceImageId: undefined,
      debugData: undefined,
    });
  };

  return {
    ...state,
    processMenuImage,
    reset,
  };
}
