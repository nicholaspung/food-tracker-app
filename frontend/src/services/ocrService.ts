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
async function initOCRWorker(): Promise<Worker> {
  if (ocrWorker) {
    return ocrWorker;
  }

  const worker = await createWorker('eng', 1, {
    logger: (m) => {
      // Log progress for debugging
      if (m.status === 'recognizing text') {
        console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
      }
    },
  });

  ocrWorker = worker;
  return worker;
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
 */
export async function performOCR(imageFile: File): Promise<OCRResult> {
  const worker = await initOCRWorker();

  const {
    data: { text, confidence },
  } = await worker.recognize(imageFile);

  return {
    text,
    confidence,
  };
}

/**
 * Parse OCR text into menu items
 * Uses simple pattern matching to extract item names
 */
export function parseMenuItems(ocrText: string): ExtractedMenuItem[] {
  if (!ocrText.trim()) {
    return [];
  }

  const lines = ocrText.split('\n');
  const menuItems: ExtractedMenuItem[] = [];

  // Patterns to filter out non-menu items
  const skipPatterns = [
    /^[\s]*$/,                    // Empty lines
    /^\d+$/,                      // Pure numbers
    /^[\$£€¥]\s*[\d.]+$/,        // Pure prices
    /^[\d.]+\s*[\$£€¥]?$/,       // Numbers with optional currency
    /menu/i,                      // Word "menu"
    /^(appetizer|entree|main|dessert|beverage|drink)s?$/i, // Section headers
    /^\d+\s*oz$/i,               // Sizes (e.g., "12 oz")
    /^(small|medium|large)$/i,   // Sizes
    /^(breakfast|lunch|dinner)$/i, // Meal types
    /^page\s+\d+/i,              // Page numbers
    /^www\./i,                   // URLs
    /^tel:|phone:/i,             // Phone numbers
    /^address:/i,                // Addresses
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

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
    if (alphaCount < line.length * 0.5) {
      continue;
    }

    // Extract name and possible description
    // If line has a dash or colon, split it
    const separatorMatch = line.match(/^([^:-]+)[\s-:]+(.+)$/);

    if (separatorMatch) {
      const name = separatorMatch[1].trim();
      const description = separatorMatch[2].trim();

      // Check if description looks like a price (skip it)
      if (!/^[\$£€¥]?\s*[\d.,]+/.test(description)) {
        menuItems.push({
          name,
          description: description.length > 5 ? description : undefined,
        });
      } else {
        menuItems.push({ name });
      }
    } else {
      // No separator, just use the line as name
      menuItems.push({ name: line });
    }
  }

  // Remove duplicates (case-insensitive)
  const uniqueItems = menuItems.filter(
    (item, index, self) =>
      index ===
      self.findIndex((t) => t.name.toLowerCase() === item.name.toLowerCase())
  );

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
