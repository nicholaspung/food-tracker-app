/**
 * Photo service for dish photos
 * Optimized for social sharing with balanced quality/size
 */

const RATING_LABELS = [
  "Don't eat ever",
  "Try once",
  "Eat once in a while",
  "Eat occasionally",
  "Eat often",
];

const RATING_COLORS = [
  "#ef4444", // red-500
  "#f97316", // orange-500
  "#eab308", // yellow-500
  "#84cc16", // lime-500
  "#22c55e", // green-500
];

/**
 * Compress dish photo for storage and social sharing
 * Uses balanced approach: 1600px max, 80% quality
 * Larger and higher quality than menu OCR images for social media
 */
export async function compressDishPhoto(file: File): Promise<File> {
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

        // Resize if too large (max 1600px width for dish photos)
        const maxWidth = 1600;
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

        // Convert to blob with 80% quality for social sharing
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
          0.80 // Quality setting (0-1) - balanced for social sharing
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
  });
}

export type BadgeTheme = 'modern' | 'rustic';

/**
 * Generate social share image with badge overlay
 * Creates a composite image with restaurant/dish info overlay
 */
export async function generateSocialShareImage(
  photoFile: File,
  overlayData: {
    restaurantName: string;
    dishName: string;
    rating: number;
    visitDate: string;
  },
  theme: BadgeTheme = 'modern'
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(photoFile);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');

        // Target Instagram optimal size: 1080px
        const targetSize = 1080;
        let width = img.width;
        let height = img.height;

        // Calculate dimensions to fit 1080px (maintaining aspect ratio)
        if (width > height) {
          // Landscape - fit to width
          if (width > targetSize) {
            height = (height * targetSize) / width;
            width = targetSize;
          }
        } else {
          // Portrait or square - fit to height
          if (height > targetSize) {
            width = (width * targetSize) / height;
            height = targetSize;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Draw the main image
        ctx.drawImage(img, 0, 0, width, height);

        // Draw badge overlay with selected theme
        if (theme === 'rustic') {
          drawRusticBadgeOverlay(ctx, width, height, overlayData);
        } else {
          drawModernBadgeOverlay(ctx, width, height, overlayData);
        }

        // Convert to blob for sharing
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to generate share image'));
              return;
            }
            resolve(blob);
          },
          'image/jpeg',
          0.92 // High quality for final share image
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
  });
}

/**
 * Draw a modern badge overlay on the canvas
 */
function drawModernBadgeOverlay(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  data: {
    restaurantName: string;
    dishName: string;
    rating: number;
    visitDate: string;
  }
) {
  // Badge configuration
  const padding = 20;
  const badgeWidth = canvasWidth - (padding * 2);
  const badgeHeight = 100;
  const badgeX = padding;
  const badgeY = canvasHeight - badgeHeight - padding;
  const borderRadius = 12;

  // Draw semi-transparent background with rounded corners
  ctx.save();

  // Create rounded rectangle path
  ctx.beginPath();
  ctx.moveTo(badgeX + borderRadius, badgeY);
  ctx.lineTo(badgeX + badgeWidth - borderRadius, badgeY);
  ctx.quadraticCurveTo(badgeX + badgeWidth, badgeY, badgeX + badgeWidth, badgeY + borderRadius);
  ctx.lineTo(badgeX + badgeWidth, badgeY + badgeHeight - borderRadius);
  ctx.quadraticCurveTo(badgeX + badgeWidth, badgeY + badgeHeight, badgeX + badgeWidth - borderRadius, badgeY + badgeHeight);
  ctx.lineTo(badgeX + borderRadius, badgeY + badgeHeight);
  ctx.quadraticCurveTo(badgeX, badgeY + badgeHeight, badgeX, badgeY + badgeHeight - borderRadius);
  ctx.lineTo(badgeX, badgeY + borderRadius);
  ctx.quadraticCurveTo(badgeX, badgeY, badgeX + borderRadius, badgeY);
  ctx.closePath();

  // Fill with semi-transparent dark background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fill();

  // Add subtle border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Draw text content
  const textX = badgeX + 16;
  let textY = badgeY + 28;

  // Restaurant name (top, smaller)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(data.restaurantName.toUpperCase(), textX, textY);

  // Dish name (middle, larger)
  textY += 26;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  // Truncate dish name if too long
  let dishName = data.dishName;
  const maxDishWidth = badgeWidth - 180; // Leave space for rating badge
  let dishWidth = ctx.measureText(dishName).width;
  while (dishWidth > maxDishWidth && dishName.length > 3) {
    dishName = dishName.slice(0, -4) + '...';
    dishWidth = ctx.measureText(dishName).width;
  }
  ctx.fillText(dishName, textX, textY);

  // Colored rating badge (right side of dish name)
  const ratingLabel = RATING_LABELS[data.rating - 1] || 'Unknown';
  const ratingColor = RATING_COLORS[data.rating - 1] || '#6b7280';

  // Measure rating text to create properly sized badge
  ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const ratingTextWidth = ctx.measureText(ratingLabel).width;
  const badgePadding = 12;
  const ratingBadgeWidth = ratingTextWidth + (badgePadding * 2);
  const ratingBadgeHeight = 26;
  const ratingBadgeX = badgeX + badgeWidth - ratingBadgeWidth - 16;
  const ratingBadgeY = textY - 18;

  // Draw colored rating badge background
  ctx.fillStyle = ratingColor;
  ctx.beginPath();
  ctx.roundRect(ratingBadgeX, ratingBadgeY, ratingBadgeWidth, ratingBadgeHeight, 6);
  ctx.fill();

  // Draw rating text
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(ratingLabel, ratingBadgeX + (ratingBadgeWidth / 2), ratingBadgeY + 18);
  ctx.textAlign = 'left'; // Reset text align

  // Date (bottom, smallest)
  textY += 22;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  // Format date nicely
  const formattedDate = new Date(data.visitDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  ctx.fillText(formattedDate, textX, textY);

  ctx.restore();
}

/**
 * Draw a rustic badge overlay on the canvas
 * Warm, vintage-inspired design with earthy tones
 */
function drawRusticBadgeOverlay(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  data: {
    restaurantName: string;
    dishName: string;
    rating: number;
    visitDate: string;
  }
) {
  // Badge configuration
  const padding = 20;
  const badgeWidth = canvasWidth - (padding * 2);
  const badgeHeight = 120;
  const badgeX = padding;
  const badgeY = canvasHeight - badgeHeight - padding;

  ctx.save();

  // Draw rustic textured background with subtle gradient
  const gradient = ctx.createLinearGradient(badgeX, badgeY, badgeX, badgeY + badgeHeight);
  gradient.addColorStop(0, 'rgba(101, 67, 33, 0.92)'); // Darker brown
  gradient.addColorStop(0.5, 'rgba(139, 90, 43, 0.92)'); // Medium brown
  gradient.addColorStop(1, 'rgba(101, 67, 33, 0.92)'); // Darker brown again

  // Draw background with slight rounded corners
  ctx.fillStyle = gradient;
  ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);

  // Add texture effect with noise
  ctx.globalAlpha = 0.1;
  for (let i = 0; i < 100; i++) {
    const x = badgeX + Math.random() * badgeWidth;
    const y = badgeY + Math.random() * badgeHeight;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;

  // Add decorative border - top and bottom lines
  ctx.strokeStyle = 'rgba(222, 184, 135, 0.6)'; // Burlywood
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(badgeX + 10, badgeY + 8);
  ctx.lineTo(badgeX + badgeWidth - 10, badgeY + 8);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(badgeX + 10, badgeY + badgeHeight - 8);
  ctx.lineTo(badgeX + badgeWidth - 10, badgeY + badgeHeight - 8);
  ctx.stroke();

  // Draw text content
  const textX = badgeX + 20;
  let textY = badgeY + 32;

  // Restaurant name (top, vintage style)
  ctx.fillStyle = '#F5DEB3'; // Wheat color
  ctx.font = 'italic bold 13px Georgia, serif';
  ctx.fillText(data.restaurantName.toUpperCase(), textX, textY);

  // Dish name (middle, larger serif font)
  textY += 28;
  ctx.fillStyle = '#FFF8DC'; // Cornsilk
  ctx.font = 'bold 22px Georgia, "Times New Roman", serif';

  // Truncate dish name if too long
  let dishName = data.dishName;
  const maxDishWidth = badgeWidth - 200;
  let dishWidth = ctx.measureText(dishName).width;
  while (dishWidth > maxDishWidth && dishName.length > 3) {
    dishName = dishName.slice(0, -4) + '...';
    dishWidth = ctx.measureText(dishName).width;
  }
  ctx.fillText(dishName, textX, textY);

  // Rustic rating badge (wooden plaque style)
  const ratingLabel = RATING_LABELS[data.rating - 1] || 'Unknown';
  const ratingColor = RATING_COLORS[data.rating - 1] || '#8B4513'; // SaddleBrown

  ctx.font = 'bold 12px Georgia, serif';
  const ratingTextWidth = ctx.measureText(ratingLabel).width;
  const badgePadding = 14;
  const ratingBadgeWidth = ratingTextWidth + (badgePadding * 2);
  const ratingBadgeHeight = 28;
  const ratingBadgeX = badgeX + badgeWidth - ratingBadgeWidth - 20;
  const ratingBadgeY = textY - 20;

  // Draw wood plaque background
  const plaqueGradient = ctx.createLinearGradient(
    ratingBadgeX, ratingBadgeY,
    ratingBadgeX, ratingBadgeY + ratingBadgeHeight
  );
  plaqueGradient.addColorStop(0, ratingColor);
  plaqueGradient.addColorStop(0.5, ratingColor + 'DD'); // Slightly darker
  plaqueGradient.addColorStop(1, ratingColor);

  ctx.fillStyle = plaqueGradient;
  ctx.fillRect(ratingBadgeX, ratingBadgeY, ratingBadgeWidth, ratingBadgeHeight);

  // Border for plaque
  ctx.strokeStyle = 'rgba(101, 67, 33, 0.6)';
  ctx.lineWidth = 2;
  ctx.strokeRect(ratingBadgeX, ratingBadgeY, ratingBadgeWidth, ratingBadgeHeight);

  // Rating text
  ctx.fillStyle = '#FFF8DC';
  ctx.textAlign = 'center';
  ctx.font = 'bold 12px Georgia, serif';
  ctx.fillText(ratingLabel, ratingBadgeX + (ratingBadgeWidth / 2), ratingBadgeY + 18);
  ctx.textAlign = 'left';

  // Date (bottom, vintage style)
  textY += 32;
  ctx.fillStyle = 'rgba(245, 222, 179, 0.9)'; // Wheat
  ctx.font = 'italic 11px Georgia, serif';

  const formattedDate = new Date(data.visitDate).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  ctx.fillText(formattedDate, textX, textY);

  ctx.restore();
}
