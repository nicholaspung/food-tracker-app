import { pb, MenuImage, MenuItem, User } from '@/lib/pocketbase';
import { logger } from '@/lib/logger';
import {
  hasExceededDailyLimit,
  getRemainingAttempts,
  incrementFailedAttempts,
} from './ocrRateLimitService';

export interface OCRResult {
  csv: string;
  debug?: {
    rawResponse: string;
    candidatesCount: number;
    model: string;
    prompt: string;
    finishReason?: any;
    safetyRatings?: any;
    parts?: any[];
  };
}

export interface ExtractedMenuItem {
  name: string;
  description?: string;
  price?: string;
}

/**
 * Check if the current user has unlimited photo parsing (subscriber or admin)
 */
function hasUnlimitedParsing(): boolean {
  const user = pb.authStore.record as User | null;
  if (!user) return false;

  // Admins and subscribers get unlimited parsing
  return user.isAdmin === true || user.isSubscriber === true;
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
  // Check rate limit before proceeding (skip for subscribers and admins)
  const hasUnlimited = hasUnlimitedParsing();
  if (!hasUnlimited && hasExceededDailyLimit()) {
    const remaining = getRemainingAttempts();
    throw new Error(
      `You have reached the daily limit for failed menu uploads. You have ${remaining} attempts remaining today. Please try again tomorrow.`
    );
  }

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

    // If status is 400 (not a menu), increment failed attempts counter (skip for subscribers/admins)
    if (response.status === 400) {
      if (!hasUnlimited) {
        incrementFailedAttempts();
        const remaining = getRemainingAttempts();

        if (remaining > 0) {
          throw new Error(
            `This image does not appear to be a menu. Please upload a clear picture of a menu. You have ${remaining} attempts remaining today.`
          );
        } else {
          throw new Error(
            `This image does not appear to be a menu. You have reached the daily limit for failed uploads. Please try again tomorrow.`
          );
        }
      } else {
        // Subscribers/admins get a simpler error message without attempt tracking
        throw new Error(
          `This image does not appear to be a menu. Please upload a clear picture of a menu.`
        );
      }
    }

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

  // Return both CSV and debug data (if available for admins)
  return {
    csv: result.csv,
    debug: result.debug, // Only populated for admin users
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

  // Remove markdown code fences if present (```csv and ```)
  let cleanedText = csvText.trim();
  cleanedText = cleanedText.replace(/^```csv\s*/i, ''); // Remove opening fence
  cleanedText = cleanedText.replace(/```\s*$/, ''); // Remove closing fence
  cleanedText = cleanedText.trim();

  const lines = cleanedText.split('\n').map(line => line.trim()).filter(Boolean);
  const menuItems: ExtractedMenuItem[] = [];

  // Skip header row if present (case-insensitive check for "menu_item")
  const startIndex = lines[0] && lines[0].toLowerCase().includes('menu_item') ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];

    // Skip any remaining markdown artifacts
    if (line.startsWith('```')) continue;

    // Parse CSV line (simple comma split - Gemini should handle escaping)
    const parts = line.split(',').map(part => part.trim());

    if (parts.length >= 2) {
      const name = parts[0];
      const price = parts[1];

      // Skip header row variations and known bad values
      if (!name ||
          name.toLowerCase() === 'menu_item' ||
          name.toLowerCase() === 'item' ||
          name.toLowerCase().includes('```') ||
          name.length < 2) {
        continue;
      }

      menuItems.push({
        name,
        price,
      });
    } else if (parts.length === 1 && parts[0].length >= 2) {
      const name = parts[0];

      // Skip header row variations and known bad values
      if (name.toLowerCase() === 'menu_item' ||
          name.toLowerCase() === 'item' ||
          name.toLowerCase().includes('```')) {
        continue;
      }

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
 * Rejects garbage OCR results while supporting multilingual text (Korean, Chinese, Japanese, etc.)
 */
function isValidMenuItemName(name: string): boolean {
  // Must have minimum length
  if (name.length < 2) return false;

  // Count letter-like characters (supports Unicode: Korean, Chinese, Japanese, Arabic, etc.)
  // \p{L} matches any Unicode letter character
  const letterCount = (name.match(/[\p{L}]/gu) || []).length;

  // Count numbers
  const numberCount = (name.match(/[\p{N}]/gu) || []).length;

  // Count letters + numbers
  const alphanumericCount = letterCount + numberCount;

  // Must have at least 2 letter or number characters
  if (alphanumericCount < 2) return false;

  // Must not be ALL special characters (allow dishes like "김치찌개" or "BBQ Ribs" or "麻婆豆腐")
  // At least 40% of the string should be letters or numbers
  if (alphanumericCount < name.length * 0.4) return false;

  return true;
}

/**
 * Create menu items from extracted items
 * Returns array of created MenuItem records
 */
export async function createMenuItems(
  restaurantId: string,
  extractedItems: ExtractedMenuItem[],
  sourceImageId?: string,
  options?: { skipValidation?: boolean; isFromOCR?: boolean }
): Promise<MenuItem[]> {
  const createdItems: MenuItem[] = [];

  for (const item of extractedItems) {
    try {
      // Validate item name quality (skip for manually added items)
      if (!options?.skipValidation && !isValidMenuItemName(item.name)) {
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
        createdBy: pb.authStore.model?.id,
      };

      if (item.description) {
        data.description = item.description;
      }

      if (sourceImageId) {
        data.sourceImage = sourceImageId;
      }

      // Add flag to indicate if this was created from OCR
      const isFromOCR = options?.isFromOCR ?? false;
      data.isFromOCR = isFromOCR;

      // Set visibility based on creation method
      // OCR items are community visible (public), manual items are friends-only by default
      data.visibility = isFromOCR ? 'public' : 'friends';

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

/**
 * Search menu items with fuzzy matching
 * Returns items that contain the search term (case-insensitive)
 */
export async function searchMenuItems(
  restaurantId: string,
  searchTerm: string
): Promise<MenuItem[]> {
  try {
    if (!searchTerm.trim()) {
      return [];
    }

    const sanitized = sanitizeForQuery(searchTerm);

    // Use ~ for case-insensitive partial match
    const items = await pb.collection('menu_items').getFullList<MenuItem>({
      filter: `restaurant = "${restaurantId}" && name ~ "${sanitized}"`,
      sort: 'name',
    });

    return items;
  } catch (error) {
    logger.error('Failed to search menu items:', error);
    return [];
  }
}

/**
 * Calculate similarity score between two strings (0-1)
 * Higher score means more similar
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  // Exact match
  if (s1 === s2) return 1.0;

  // Contains match
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;

  // Word overlap
  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  const commonWords = words1.filter(w => words2.some(w2 => w2.includes(w) || w.includes(w2)));

  if (commonWords.length > 0) {
    return 0.5 + (commonWords.length / Math.max(words1.length, words2.length)) * 0.3;
  }

  return 0;
}

/**
 * Find best matching menu items for a parsed item
 * Returns items sorted by similarity score
 */
export async function findMatchingMenuItems(
  restaurantId: string,
  itemName: string,
  maxResults: number = 5
): Promise<MenuItem[]> {
  try {
    // Get all menu items for the restaurant
    const allItems = await getRestaurantMenuItems(restaurantId);

    // Calculate similarity scores and sort
    const scoredItems = allItems
      .map(item => ({
        item,
        score: calculateSimilarity(itemName, item.name),
      }))
      .filter(({ score }) => score > 0.3) // Only keep reasonably similar items
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    return scoredItems.map(({ item }) => item);
  } catch (error) {
    logger.error('Failed to find matching menu items:', error);
    return [];
  }
}

