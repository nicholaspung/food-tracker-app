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
}

export function useMenuOCR() {
  const [state, setState] = useState<UseMenuOCRState>({
    status: 'idle',
    progress: 0,
    extractedItems: [],
    menuItems: [],
    error: null,
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
      });

      const compressedImage = await compressImage(imageFile);

      // Step 2: Upload to PocketBase
      setState((prev) => ({
        ...prev,
        status: 'uploading',
        progress: 30,
      }));

      const menuImage = await uploadMenuImage(restaurantId, compressedImage);

      // Step 3: Perform OCR with real-time progress updates
      setState((prev) => ({
        ...prev,
        status: 'processing',
        progress: 50,
      }));

      const ocrResult = await performOCR(compressedImage, (ocrProgress) => {
        // Map OCR progress (0-1) to our overall progress range (50-70%)
        const mappedProgress = 50 + (ocrProgress * 20);
        setState((prev) => ({
          ...prev,
          progress: Math.round(mappedProgress),
        }));
      });

      // Step 4: Parse menu items from OCR text
      setState((prev) => ({
        ...prev,
        progress: 70,
      }));

      const extracted = parseMenuItems(ocrResult.text);

      if (extracted.length === 0) {
        throw new Error(
          'No menu items found. Please ensure the image is clear and contains menu text.'
        );
      }

      // Step 5: Create menu_items records in database
      setState((prev) => ({
        ...prev,
        progress: 85,
      }));

      const createdItems = await createMenuItems(
        restaurantId,
        extracted,
        menuImage.id
      );

      // Step 6: Complete
      setState({
        status: 'complete',
        progress: 100,
        extractedItems: extracted,
        menuItems: createdItems,
        error: null,
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
    });
  };

  return {
    ...state,
    processMenuImage,
    reset,
  };
}
