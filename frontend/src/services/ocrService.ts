import { pb, MenuImage, MenuItem } from '@/lib/pocketbase';
import { logger } from '@/lib/logger';

export interface OCRResult {
  csv: string;
}

export interface ExtractedMenuItem {
  name: string;
  description?: string;
  price?: string;
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
 * Perform OCR on an image file using Google Gemini via backend
 * @param imageFile - The image file to process
 * @param onProgress - Optional callback to receive progress updates (0-1)
 */
export async function performOCR(
  imageFile: File,
  onProgress?: (progress: number) => void
): Promise<OCRResult> {
  logger.log('Sending image to Gemini for menu parsing...');

  // Update progress
  if (onProgress) {
    onProgress(0.3);
  }

  // Create FormData and upload to backend for Gemini processing
  const formData = new FormData();
  formData.append('image', imageFile);

  const baseUrl = pb.baseUrl;
  const token = pb.authStore.token;

  if (onProgress) {
    onProgress(0.5);
  }

  const response = await fetch(`${baseUrl}/api/parse-menu`, {
    method: 'POST',
    headers: {
      'Authorization': token ? `Bearer ${token}` : '',
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Gemini parsing failed:', errorText);
    throw new Error(`Failed to parse menu: ${response.statusText}`);
  }

  if (onProgress) {
    onProgress(0.9);
  }

  const result = await response.json();

  logger.log('Gemini parsing successful');

  if (onProgress) {
    onProgress(1.0);
  }

  return {
    csv: result.csv,
  };
}

/**
 * Parse CSV text from Gemini into menu items
 * Expected format: menu_item,price
 */
export function parseMenuItems(csvText: string): ExtractedMenuItem[] {
  if (!csvText.trim()) {
    return [];
  }

  const lines = csvText.split('\n').map(line => line.trim()).filter(Boolean);
  const menuItems: ExtractedMenuItem[] = [];

  // Skip header row if present
  const startIndex = lines[0] && lines[0].toLowerCase().includes('menu_item') ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];

    // Parse CSV line (simple comma split - Gemini should handle escaping)
    const parts = line.split(',').map(part => part.trim());

    if (parts.length >= 2) {
      const name = parts[0];
      const price = parts[1];

      // Skip invalid entries
      if (!name || name.length < 2) {
        continue;
      }

      menuItems.push({
        name,
        price,
      });
    } else if (parts.length === 1 && parts[0].length >= 3) {
      // Item without price
      menuItems.push({
        name: parts[0],
      });
    }
  }

  logger.log(`Parsed ${menuItems.length} menu items from CSV`);

  return menuItems;
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
 * Sanitize text for use in PocketBase queries
 * Escapes special characters that break query syntax
 */
function sanitizeForQuery(text: string): string {
  // Remove or escape characters that break PocketBase filter syntax
  return text
    .replace(/\\/g, '\\\\')  // Escape backslashes
    .replace(/"/g, '\\"')     // Escape quotes
    .replace(/'/g, "\\'")     // Escape single quotes
    .replace(/\n/g, ' ')      // Replace newlines with spaces
    .replace(/\r/g, ' ')      // Replace carriage returns
    .replace(/\t/g, ' ')      // Replace tabs
    .trim();
}

/**
 * Validate if a menu item name is reasonable
 * Rejects garbage OCR results
 */
function isValidMenuItemName(name: string): boolean {
  // Must have minimum length
  if (name.length < 3) return false;

  // Must have at least 50% alphabetic characters
  const alphaCount = (name.match(/[a-zA-Z]/g) || []).length;
  if (alphaCount < name.length * 0.5) return false;

  // Must not be mostly special characters
  const specialCount = (name.match(/[^a-zA-Z0-9\s]/g) || []).length;
  if (specialCount > name.length * 0.4) return false;

  // Must have at least 2 alphabetic characters
  if (alphaCount < 2) return false;

  return true;
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
      // Validate item name quality
      if (!isValidMenuItemName(item.name)) {
        logger.warn(`Skipping invalid menu item: "${item.name}"`);
        continue;
      }

      // Sanitize name for query
      const sanitizedName = sanitizeForQuery(item.name);

      // Check if item already exists for this restaurant (case-insensitive)
      const existingItems = await pb.collection('menu_items').getFullList<MenuItem>({
        filter: `restaurant = "${restaurantId}" && name ?~ "${sanitizedName}"`,
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
      logger.error(`Failed to create menu item "${item.name}":`, error);
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
    logger.error('Failed to get last menu upload date:', error);
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
    logger.error('Failed to get restaurant menu items:', error);
    return [];
  }
}

