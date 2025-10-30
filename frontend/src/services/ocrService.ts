import { createWorker, Worker } from 'tesseract.js';
import { pb, MenuImage, MenuItem } from '@/lib/pocketbase';
import { logger } from '@/lib/logger';

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
          logger.log(`OCR Progress: ${progressPercent}%`);

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
 * Apply Gaussian blur for noise reduction (simplified bilateral filter)
 */
function applyGaussianBlur(data: Uint8ClampedArray, width: number, height: number, radius: number = 1): void {
  // Gaussian kernel (3x3 for radius=1)
  const kernel = [
    1/16, 2/16, 1/16,
    2/16, 4/16, 2/16,
    1/16, 2/16, 1/16
  ];

  const tempData = new Uint8ClampedArray(data);

  for (let y = radius; y < height - radius; y++) {
    for (let x = radius; x < width - radius; x++) {
      const idx = (y * width + x) * 4;
      let sum = 0;

      let ki = 0;
      for (let ky = -radius; ky <= radius; ky++) {
        for (let kx = -radius; kx <= radius; kx++) {
          const kidx = ((y + ky) * width + (x + kx)) * 4;
          sum += tempData[kidx] * kernel[ki];
          ki++;
        }
      }

      data[idx] = sum;
      data[idx + 1] = sum;
      data[idx + 2] = sum;
    }
  }
}

/**
 * Apply adaptive thresholding (Otsu's method per region)
 */
function applyAdaptiveThreshold(data: Uint8ClampedArray, width: number, height: number, blockSize: number = 16): void {
  const tempData = new Uint8ClampedArray(data);

  for (let by = 0; by < height; by += blockSize) {
    for (let bx = 0; bx < width; bx += blockSize) {
      // Calculate threshold for this block
      let sum = 0;
      let count = 0;

      for (let y = by; y < Math.min(by + blockSize, height); y++) {
        for (let x = bx; x < Math.min(bx + blockSize, width); x++) {
          const idx = (y * width + x) * 4;
          sum += tempData[idx];
          count++;
        }
      }

      const threshold = sum / count;

      // Apply threshold to this block
      for (let y = by; y < Math.min(by + blockSize, height); y++) {
        for (let x = bx; x < Math.min(bx + blockSize, width); x++) {
          const idx = (y * width + x) * 4;
          const value = tempData[idx] > threshold ? 255 : 0;
          data[idx] = value;
          data[idx + 1] = value;
          data[idx + 2] = value;
        }
      }
    }
  }
}

/**
 * Detect and correct image rotation using edge detection
 */
function detectRotation(data: Uint8ClampedArray, width: number, height: number): number {
  // Sample horizontal and vertical edge strength
  let horizontalEdges = 0;
  let verticalEdges = 0;

  // Sample middle third of image to avoid edges
  const startY = Math.floor(height / 3);
  const endY = Math.floor(2 * height / 3);
  const startX = Math.floor(width / 3);
  const endX = Math.floor(2 * width / 3);

  for (let y = startY; y < endY - 1; y++) {
    for (let x = startX; x < endX - 1; x++) {
      const idx = (y * width + x) * 4;
      const idxRight = (y * width + x + 1) * 4;
      const idxDown = ((y + 1) * width + x) * 4;

      // Horizontal edge strength
      horizontalEdges += Math.abs(data[idx] - data[idxRight]);

      // Vertical edge strength
      verticalEdges += Math.abs(data[idx] - data[idxDown]);
    }
  }

  // If vertical edges are much stronger, image might be rotated 90 degrees
  if (verticalEdges > horizontalEdges * 1.5) {
    return 90; // Rotate 90 degrees clockwise
  }

  return 0; // No rotation needed
}

/**
 * Preprocess image for better OCR accuracy
 * Advanced preprocessing: noise reduction, adaptive thresholding, rotation correction
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
        const scaleFactor = 2.5; // Slightly reduced for performance
        let width = img.width * scaleFactor;
        let height = img.height * scaleFactor;

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
        let imageData = ctx.getImageData(0, 0, width, height);
        let data = imageData.data;

        logger.log('Step 1: Converting to grayscale...');
        // Step 1: Convert to grayscale with contrast enhancement
        for (let i = 0; i < data.length; i += 4) {
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

          // Moderate contrast enhancement
          const contrast = 1.25;
          const factor = (259 * (contrast + 1)) / (259 - contrast);
          const enhanced = factor * (gray - 128) + 128;
          const clamped = Math.max(0, Math.min(255, enhanced));

          data[i] = clamped;
          data[i + 1] = clamped;
          data[i + 2] = clamped;
        }

        logger.log('Step 2: Detecting rotation...');
        // Step 2: Detect if rotation is needed
        const rotation = detectRotation(data, width, height);
        if (rotation !== 0) {
          logger.log(`Rotating image ${rotation} degrees`);

          // Rotate canvas
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = height; // Swap dimensions
          tempCanvas.height = width;
          const tempCtx = tempCanvas.getContext('2d');

          if (tempCtx) {
            tempCtx.translate(height / 2, width / 2);
            tempCtx.rotate((rotation * Math.PI) / 180);
            tempCtx.drawImage(canvas, -width / 2, -height / 2);

            // Update canvas and dimensions
            canvas.width = height;
            canvas.height = width;
            ctx.drawImage(tempCanvas, 0, 0);
            [width, height] = [height, width];

            imageData = ctx.getImageData(0, 0, width, height);
            data = imageData.data;
          }
        }

        logger.log('Step 3: Applying noise reduction (Gaussian blur)...');
        // Step 3: Apply Gaussian blur for noise reduction
        applyGaussianBlur(data, width, height, 1);

        logger.log('Step 4: Applying adaptive thresholding...');
        // Step 4: Apply adaptive thresholding per region
        applyAdaptiveThreshold(data, width, height, 16);

        // Put processed image back
        ctx.putImageData(imageData, 0, 0);

        logger.log('Preprocessing complete');
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
  logger.log('Preprocessing image for OCR...');
  const preprocessedImage = await preprocessImageForOCR(imageFile);
  logger.log('Image preprocessing complete');

  // Configure Tesseract parameters for menu text
  // Try PSM 4 first (single column of text) - often better for menus than PSM 6
  // OEM 3: Default LSTM engine (best accuracy)
  const {
    data: { text, confidence },
  } = await worker.recognize(preprocessedImage, {
    tessedit_pageseg_mode: '4',  // PSM 4: Single column of text (good for vertical menus)
    tessedit_ocr_engine_mode: '3', // OEM 3: Default LSTM
  } as any);

  logger.log(`OCR confidence: ${Math.round(confidence)}%`);

  // Warn if confidence is very low
  if (confidence < 50) {
    logger.warn('Low OCR confidence detected. Try retaking the photo with better lighting and focus.');
  }

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

    // Skip lines with excessive special characters (likely OCR noise)
    const specialCharCount = (line.match(/[\\|]/g) || []).length;
    if (specialCharCount > 2) {
      continue;
    }

    // Skip lines with too many repeated characters (OCR artifacts)
    const hasRepeatedChars = /(.)\1{4,}/.test(line);
    if (hasRepeatedChars) {
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

/**
 * Cleanup: terminate OCR worker
 */
export async function terminateOCRWorker(): Promise<void> {
  if (ocrWorker) {
    await ocrWorker.terminate();
    ocrWorker = null;
  }
}
