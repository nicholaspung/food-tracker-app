import { createWorker, Worker } from 'tesseract.js';
import { pb, MenuImage, MenuItem } from '@/lib/pocketbase';

let ocrWorker: Worker | null = null;

export interface OCRResult {
  text: string;
  confidence: number;
}

export interface ExtractedMenuItem {
  name: string;
  description?: string;
}

/**
 * Initialize Tesseract.js worker
 * Only creates worker once per session
 */
async function initOCRWorker(progressCallback?: (progress: number) => void): Promise<Worker> {
  // Always create a new worker if a progress callback is provided
  // This ensures the callback is properly bound
  if (progressCallback || !ocrWorker) {
    const worker = await createWorker('eng', 1, {
      logger: (m) => {
        // Log progress for debugging
        if (m.status === 'recognizing text') {
          const progressPercent = Math.round(m.progress * 100);
          console.log(`OCR Progress: ${progressPercent}%`);

          // Call the progress callback if provided
          if (progressCallback) {
            progressCallback(m.progress);
          }
        }
      },
    });

    // Only cache if no progress callback (default behavior)
    if (!progressCallback) {
      ocrWorker = worker;
    }

    return worker;
  }

  return ocrWorker;
}

/**
 * Preprocess image for better OCR accuracy
 * Applies: grayscale, contrast enhancement, sharpening, and upscaling to 300 DPI
 */
async function preprocessImageForOCR(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');

        // Target ~300 DPI for better OCR
        // Assuming typical phone photos are ~72-96 DPI, we upscale 3-4x
        const scaleFactor = 3;
        const width = img.width * scaleFactor;
        const height = img.height * scaleFactor;

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Draw upscaled image
        ctx.drawImage(img, 0, 0, width, height);

        // Get image data for pixel manipulation
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        // Step 1: Convert to grayscale and enhance contrast
        for (let i = 0; i < data.length; i += 4) {
          // Grayscale using luminosity method
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

          // Enhance contrast (adjust midpoint and strength)
          const contrast = 1.3; // Increase contrast
          const factor = (259 * (contrast + 1)) / (259 - contrast);
          const enhanced = factor * (gray - 128) + 128;
          const clamped = Math.max(0, Math.min(255, enhanced));

          data[i] = clamped;     // R
          data[i + 1] = clamped; // G
          data[i + 2] = clamped; // B
          // Alpha stays the same
        }

        // Step 2: Apply adaptive thresholding (simplified version)
        // This helps separate text from background
        const threshold = 128;
        for (let i = 0; i < data.length; i += 4) {
          const value = data[i] > threshold ? 255 : 0;
          data[i] = value;
          data[i + 1] = value;
          data[i + 2] = value;
        }

        // Put processed image back
        ctx.putImageData(imageData, 0, 0);

        // Convert to blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to process image'));
              return;
            }

            const processedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });

            resolve(processedFile);
          },
          'image/jpeg',
          0.95 // High quality for OCR
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
  });
}

/**
 * Compress image before upload to reduce file size
 * Maintains quality for OCR readability
 */
export async function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Resize if too large (max 1920px width)
        const maxWidth = 1920;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Convert to blob with quality adjustment
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'));
              return;
            }

            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });

            resolve(compressedFile);
          },
          'image/jpeg',
          0.85 // Quality setting (0-1)
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
  });
}

/**
 * Perform OCR on an image file
 * @param imageFile - The image file to process
 * @param onProgress - Optional callback to receive progress updates (0-1)
 */
export async function performOCR(
  imageFile: File,
  onProgress?: (progress: number) => void
): Promise<OCRResult> {
  const worker = await initOCRWorker(onProgress);

  // Preprocess image for better OCR accuracy
  console.log('Preprocessing image for OCR...');
  const preprocessedImage = await preprocessImageForOCR(imageFile);
  console.log('Image preprocessing complete');

  // Configure Tesseract parameters for menu text
  // PSM 6: Assume uniform block of text (best for menus)
  // OEM 3: Default LSTM engine (best accuracy)
  const {
    data: { text, confidence },
  } = await worker.recognize(preprocessedImage, {
    tessedit_pageseg_mode: '6',  // PSM 6: Uniform block of text
    tessedit_ocr_engine_mode: '3', // OEM 3: Default LSTM
  });

  // Clean up worker if we created a new one with progress callback
  if (onProgress) {
    await worker.terminate();
  }

  return {
    text,
    confidence,
  };
}

/**
 * Parse OCR text into menu items
 * Uses improved pattern matching and layout-aware parsing
 */
export function parseMenuItems(ocrText: string): ExtractedMenuItem[] {
  if (!ocrText.trim()) {
    return [];
  }

  const lines = ocrText.split('\n').map(line => line.trim()).filter(Boolean);
  const menuItems: ExtractedMenuItem[] = [];

  // Patterns to filter out non-menu items
  const skipPatterns = [
    /^[\s]*$/,                    // Empty lines
    /^\d+$/,                      // Pure numbers
    /^[\$£€¥]\s*[\d.,]+\s*$/,    // Pure prices
    /^[\d.,]+\s*[\$£€¥]?\s*$/,   // Numbers with optional currency at end
    /^\d+\.\d{2}$/,              // Decimal prices (e.g., "12.99")
    /^menu$/i,                    // Word "menu" alone
    /^(appetizer|entree|main|dessert|beverage|drink)s?$/i, // Section headers alone
    /^\d+\s*(oz|ml|g|kg|lb)$/i,  // Sizes with units
    /^(small|medium|large|sm|md|lg|s|m|l)$/i, // Size indicators
    /^(breakfast|lunch|dinner|brunch)$/i, // Meal types
    /^page\s+\d+/i,              // Page numbers
    /^www\.|^http/i,             // URLs
    /^tel:|^phone:|^\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/i, // Phone numbers
    /^address:|^location:/i,     // Addresses
    /^open|^close|^hour/i,       // Hours info
    /^served|^available/i,       // Service info
    /^[\d\s\-\(\)]+$/,          // Only numbers, spaces, dashes, parens
  ];

  // Price pattern - matches various price formats at end of line
  const pricePattern = /[\$£€¥]?\s*\d+[.,]\d{2}[\$£€¥]?$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip if line matches any skip pattern
    if (skipPatterns.some(pattern => pattern.test(line))) {
      continue;
    }

    // Skip very short lines (likely noise)
    if (line.length < 3) {
      continue;
    }

    // Skip lines with mostly numbers or special characters
    const alphaCount = (line.match(/[a-zA-Z]/g) || []).length;
    if (alphaCount < Math.max(3, line.length * 0.4)) {
      continue;
    }

    // Remove price from end of line if present
    let cleanLine = line.replace(pricePattern, '').trim();

    // Skip if after removing price, nothing meaningful remains
    if (cleanLine.length < 3) {
      continue;
    }

    // Strategy 1: Check for dash or colon separator (name - description)
    const dashMatch = cleanLine.match(/^([^-:]+)\s*[-:]\s*(.+)$/);
    if (dashMatch) {
      const name = dashMatch[1].trim();
      const desc = dashMatch[2].trim();

      // Ensure both parts are meaningful
      if (name.length >= 3 && desc.length >= 5) {
        menuItems.push({
          name,
          description: desc,
        });
        continue;
      }
    }

    // Strategy 2: Check for parentheses (name (description))
    const parenMatch = cleanLine.match(/^([^(]+)\s*\(([^)]+)\)$/);
    if (parenMatch) {
      const name = parenMatch[1].trim();
      const desc = parenMatch[2].trim();

      if (name.length >= 3) {
        menuItems.push({
          name,
          description: desc.length >= 5 ? desc : undefined,
        });
        continue;
      }
    }

    // Strategy 3: Check for multiple sentences (name. Description)
    const sentenceMatch = cleanLine.match(/^([^.!?]+)[.!?]\s+(.+)$/);
    if (sentenceMatch) {
      const name = sentenceMatch[1].trim();
      const desc = sentenceMatch[2].trim();

      if (name.length >= 3 && desc.length >= 5) {
        menuItems.push({
          name,
          description: desc,
        });
        continue;
      }
    }

    // Strategy 4: Just use the whole line as name
    if (cleanLine.length >= 3) {
      menuItems.push({ name: cleanLine });
    }
  }

  // Remove duplicates (case-insensitive, fuzzy match)
  const uniqueItems: ExtractedMenuItem[] = [];
  for (const item of menuItems) {
    const isDuplicate = uniqueItems.some(existing => {
      const existingName = existing.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const itemName = item.name.toLowerCase().replace(/[^a-z0-9]/g, '');

      // Exact match or one is substring of other (80% similarity)
      return existingName === itemName ||
        (existingName.includes(itemName) && itemName.length / existingName.length > 0.8) ||
        (itemName.includes(existingName) && existingName.length / itemName.length > 0.8);
    });

    if (!isDuplicate) {
      uniqueItems.push(item);
    }
  }

  return uniqueItems;
}

/**
 * Upload menu image to PocketBase and create menu_images record
 */
export async function uploadMenuImage(
  restaurantId: string,
  imageFile: File
): Promise<MenuImage> {
  const formData = new FormData();
  formData.append('restaurant', restaurantId);
  formData.append('uploadedBy', pb.authStore.model?.id || '');
  formData.append('image', imageFile);

  const record = await pb.collection('menu_images').create<MenuImage>(formData);
  return record;
}

/**
 * Create menu items from extracted items
 * Returns array of created MenuItem records
 */
export async function createMenuItems(
  restaurantId: string,
  extractedItems: ExtractedMenuItem[],
  sourceImageId?: string
): Promise<MenuItem[]> {
  const createdItems: MenuItem[] = [];

  for (const item of extractedItems) {
    try {
      // Check if item already exists for this restaurant (case-insensitive)
      const existingItems = await pb.collection('menu_items').getFullList<MenuItem>({
        filter: `restaurant = "${restaurantId}" && name ?~ "${item.name}"`,
      });

      if (existingItems.length > 0) {
        // Item already exists, use existing
        createdItems.push(existingItems[0]);
        continue;
      }

      // Create new menu item
      const data: any = {
        restaurant: restaurantId,
        name: item.name,
      };

      if (item.description) {
        data.description = item.description;
      }

      if (sourceImageId) {
        data.sourceImage = sourceImageId;
      }

      const record = await pb.collection('menu_items').create<MenuItem>(data);
      createdItems.push(record);
    } catch (error) {
      console.error(`Failed to create menu item "${item.name}":`, error);
      // Continue with other items even if one fails
    }
  }

  return createdItems;
}

/**
 * Get latest menu image upload date for a restaurant
 */
export async function getLastMenuUploadDate(
  restaurantId: string
): Promise<Date | null> {
  try {
    const images = await pb.collection('menu_images').getFullList<MenuImage>({
      filter: `restaurant = "${restaurantId}"`,
      sort: '-created',
      limit: 1,
    });

    if (images.length > 0) {
      return new Date(images[0].created);
    }

    return null;
  } catch (error) {
    console.error('Failed to get last menu upload date:', error);
    return null;
  }
}

/**
 * Get all menu items for a restaurant
 */
export async function getRestaurantMenuItems(
  restaurantId: string
): Promise<MenuItem[]> {
  try {
    const items = await pb.collection('menu_items').getFullList<MenuItem>({
      filter: `restaurant = "${restaurantId}"`,
      sort: 'name',
    });

    return items;
  } catch (error) {
    console.error('Failed to get restaurant menu items:', error);
    return [];
  }
}

/**
 * Cleanup: terminate OCR worker
 */
export async function terminateOCRWorker(): Promise<void> {
  if (ocrWorker) {
    await ocrWorker.terminate();
    ocrWorker = null;
  }
}
