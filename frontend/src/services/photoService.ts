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
        const canvas = document.createElement("canvas");
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

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Convert to blob with 80% quality for social sharing
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Failed to compress image"));
              return;
            }

            const compressedFile = new File([blob], file.name, {
              type: "image/jpeg",
              lastModified: Date.now(),
            });

            resolve(compressedFile);
          },
          "image/jpeg",
          0.8 // Quality setting (0-1) - balanced for social sharing
        );
      };
      img.onerror = () => reject(new Error("Failed to load image"));
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
  });
}

export type BadgeTheme = "modern" | "rustic" | "minimal";
export type BadgePosition = "bottom" | "bottom-left" | "bottom-right";

export interface BadgeOptions {
  theme?: BadgeTheme;
  position?: BadgePosition;
  showDate?: boolean;
  showRating?: boolean;
}

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
  options: BadgeOptions | BadgeTheme = "modern"
): Promise<Blob> {
  // Handle backward compatibility with old API
  const opts: BadgeOptions =
    typeof options === "string"
      ? { theme: options, position: "bottom", showDate: true, showRating: true }
      : {
          theme: options.theme ?? "modern",
          position: options.position ?? "bottom",
          showDate: options.showDate ?? true,
          showRating: options.showRating ?? true,
        };
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(photoFile);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");

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

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        // Draw the main image
        ctx.drawImage(img, 0, 0, width, height);

        // Draw badge overlay with selected theme
        if (opts.theme === "rustic") {
          drawRusticBadgeOverlay(ctx, width, height, overlayData, opts);
        } else if (opts.theme === "minimal") {
          drawMinimalBadgeOverlay(ctx, width, height, overlayData, opts);
        } else {
          drawModernBadgeOverlay(ctx, width, height, overlayData, opts);
        }

        // Convert to blob for sharing
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Failed to generate share image"));
              return;
            }
            resolve(blob);
          },
          "image/jpeg",
          0.92 // High quality for final share image
        );
      };
      img.onerror = () => reject(new Error("Failed to load image"));
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
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
  },
  options: BadgeOptions
) {
  // Badge configuration
  const padding = 20;
  const borderRadius = 12;

  // Calculate badge dimensions based on what's being shown
  let badgeHeight = 60; // Base height for restaurant + dish name
  if (options.showRating) badgeHeight += 30;
  if (options.showDate) badgeHeight += 20;

  // Calculate position based on options
  let badgeWidth: number;
  let badgeX: number;
  const badgeY = canvasHeight - badgeHeight - padding;

  if (options.position === "bottom-left") {
    badgeWidth = Math.min(canvasWidth * 0.75, canvasWidth - padding * 2);
    badgeX = padding;
  } else if (options.position === "bottom-right") {
    badgeWidth = Math.min(canvasWidth * 0.75, canvasWidth - padding * 2);
    badgeX = canvasWidth - badgeWidth - padding;
  } else {
    // bottom (centered)
    badgeWidth = canvasWidth - padding * 2;
    badgeX = padding;
  }

  // Draw semi-transparent background with rounded corners
  ctx.save();

  // Create rounded rectangle path
  ctx.beginPath();
  ctx.moveTo(badgeX + borderRadius, badgeY);
  ctx.lineTo(badgeX + badgeWidth - borderRadius, badgeY);
  ctx.quadraticCurveTo(
    badgeX + badgeWidth,
    badgeY,
    badgeX + badgeWidth,
    badgeY + borderRadius
  );
  ctx.lineTo(badgeX + badgeWidth, badgeY + badgeHeight - borderRadius);
  ctx.quadraticCurveTo(
    badgeX + badgeWidth,
    badgeY + badgeHeight,
    badgeX + badgeWidth - borderRadius,
    badgeY + badgeHeight
  );
  ctx.lineTo(badgeX + borderRadius, badgeY + badgeHeight);
  ctx.quadraticCurveTo(
    badgeX,
    badgeY + badgeHeight,
    badgeX,
    badgeY + badgeHeight - borderRadius
  );
  ctx.lineTo(badgeX, badgeY + borderRadius);
  ctx.quadraticCurveTo(badgeX, badgeY, badgeX + borderRadius, badgeY);
  ctx.closePath();

  // Fill with semi-transparent dark background
  ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
  ctx.fill();

  // Add subtle border
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Draw text content
  const textX = badgeX + 16;
  let textY = badgeY + 28;

  // Restaurant name (top, smaller)
  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  ctx.font =
    'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(data.restaurantName.toUpperCase(), textX, textY);

  // Dish name (middle, larger)
  textY += 26;
  ctx.fillStyle = "#ffffff";
  ctx.font =
    'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  // Truncate dish name if too long
  let dishName = data.dishName;
  const maxDishWidth = options.showRating ? badgeWidth - 180 : badgeWidth - 40; // Leave space for rating badge if shown
  let dishWidth = ctx.measureText(dishName).width;
  while (dishWidth > maxDishWidth && dishName.length > 3) {
    dishName = dishName.slice(0, -4) + "...";
    dishWidth = ctx.measureText(dishName).width;
  }
  ctx.fillText(dishName, textX, textY);

  // Colored rating badge (right side of dish name) - only if showRating is true
  if (options.showRating) {
    const ratingLabel = RATING_LABELS[data.rating - 1] || "Unknown";
    const ratingColor = RATING_COLORS[data.rating - 1] || "#6b7280";

    // Measure rating text to create properly sized badge
    ctx.font =
      'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const ratingTextWidth = ctx.measureText(ratingLabel).width;
    const badgePadding = 12;
    const ratingBadgeWidth = ratingTextWidth + badgePadding * 2;
    const ratingBadgeHeight = 26;
    const ratingBadgeX = badgeX + badgeWidth - ratingBadgeWidth - 16;
    const ratingBadgeY = textY - 18;

    // Draw colored rating badge background
    ctx.fillStyle = ratingColor;
    ctx.beginPath();
    ctx.roundRect(
      ratingBadgeX,
      ratingBadgeY,
      ratingBadgeWidth,
      ratingBadgeHeight,
      6
    );
    ctx.fill();

    // Draw rating text
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText(
      ratingLabel,
      ratingBadgeX + ratingBadgeWidth / 2,
      ratingBadgeY + 18
    );
    ctx.textAlign = "left"; // Reset text align
  }

  // Date (bottom, smallest) - only if showDate is true
  if (options.showDate) {
    textY += 22;
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.font =
      '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

    // Format date nicely
    const formattedDate = new Date(data.visitDate).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    ctx.fillText(formattedDate, textX, textY);
  }

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
  },
  options: BadgeOptions
) {
  // Badge configuration
  const padding = 20;

  // Calculate badge dimensions based on what's being shown
  let badgeHeight = 70; // Base height for restaurant + dish name
  if (options.showRating) badgeHeight += 30;
  if (options.showDate) badgeHeight += 25;

  // Calculate position based on options
  let badgeWidth: number;
  let badgeX: number;
  const badgeY = canvasHeight - badgeHeight - padding;

  if (options.position === "bottom-left") {
    badgeWidth = Math.min(canvasWidth * 0.75, canvasWidth - padding * 2);
    badgeX = padding;
  } else if (options.position === "bottom-right") {
    badgeWidth = Math.min(canvasWidth * 0.75, canvasWidth - padding * 2);
    badgeX = canvasWidth - badgeWidth - padding;
  } else {
    // bottom (centered)
    badgeWidth = canvasWidth - padding * 2;
    badgeX = padding;
  }

  ctx.save();

  // Draw rustic textured background with subtle gradient
  const gradient = ctx.createLinearGradient(
    badgeX,
    badgeY,
    badgeX,
    badgeY + badgeHeight
  );
  gradient.addColorStop(0, "rgba(101, 67, 33, 0.92)"); // Darker brown
  gradient.addColorStop(0.5, "rgba(139, 90, 43, 0.92)"); // Medium brown
  gradient.addColorStop(1, "rgba(101, 67, 33, 0.92)"); // Darker brown again

  // Draw background with slight rounded corners
  ctx.fillStyle = gradient;
  ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);

  // Add texture effect with noise (reduced for performance)
  ctx.globalAlpha = 0.1;
  for (let i = 0; i < 30; i++) {
    const x = badgeX + Math.random() * badgeWidth;
    const y = badgeY + Math.random() * badgeHeight;
    ctx.fillStyle =
      Math.random() > 0.5 ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;

  // Add decorative border - top and bottom lines
  ctx.strokeStyle = "rgba(222, 184, 135, 0.6)"; // Burlywood
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
  ctx.fillStyle = "#F5DEB3"; // Wheat color
  ctx.font = "italic bold 13px Georgia, serif";
  ctx.fillText(data.restaurantName.toUpperCase(), textX, textY);

  // Dish name (middle, larger serif font)
  textY += 28;
  ctx.fillStyle = "#FFF8DC"; // Cornsilk
  ctx.font = 'bold 22px Georgia, "Times New Roman", serif';

  // Truncate dish name if too long
  let dishName = data.dishName;
  const maxDishWidth = options.showRating ? badgeWidth - 200 : badgeWidth - 40;
  let dishWidth = ctx.measureText(dishName).width;
  while (dishWidth > maxDishWidth && dishName.length > 3) {
    dishName = dishName.slice(0, -4) + "...";
    dishWidth = ctx.measureText(dishName).width;
  }
  ctx.fillText(dishName, textX, textY);

  // Rustic rating badge (wooden plaque style) - only if showRating is true
  if (options.showRating) {
    const ratingLabel = RATING_LABELS[data.rating - 1] || "Unknown";
    const ratingColor = RATING_COLORS[data.rating - 1] || "#8B4513"; // SaddleBrown

    ctx.font = "bold 12px Georgia, serif";
    const ratingTextWidth = ctx.measureText(ratingLabel).width;
    const badgePadding = 14;
    const ratingBadgeWidth = ratingTextWidth + badgePadding * 2;
    const ratingBadgeHeight = 28;
    const ratingBadgeX = badgeX + badgeWidth - ratingBadgeWidth - 20;
    const ratingBadgeY = textY - 20;

    // Draw wood plaque background
    const plaqueGradient = ctx.createLinearGradient(
      ratingBadgeX,
      ratingBadgeY,
      ratingBadgeX,
      ratingBadgeY + ratingBadgeHeight
    );
    plaqueGradient.addColorStop(0, ratingColor);
    plaqueGradient.addColorStop(0.5, ratingColor + "DD"); // Slightly darker
    plaqueGradient.addColorStop(1, ratingColor);

    ctx.fillStyle = plaqueGradient;
    ctx.fillRect(
      ratingBadgeX,
      ratingBadgeY,
      ratingBadgeWidth,
      ratingBadgeHeight
    );

    // Border for plaque
    ctx.strokeStyle = "rgba(101, 67, 33, 0.6)";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      ratingBadgeX,
      ratingBadgeY,
      ratingBadgeWidth,
      ratingBadgeHeight
    );

    // Rating text
    ctx.fillStyle = "#FFF8DC";
    ctx.textAlign = "center";
    ctx.font = "bold 12px Georgia, serif";
    ctx.fillText(
      ratingLabel,
      ratingBadgeX + ratingBadgeWidth / 2,
      ratingBadgeY + 18
    );
    ctx.textAlign = "left";
  }

  // Date (bottom, vintage style) - only if showDate is true
  if (options.showDate) {
    textY += 32;
    ctx.fillStyle = "rgba(245, 222, 179, 0.9)"; // Wheat
    ctx.font = "italic 11px Georgia, serif";

    const formattedDate = new Date(data.visitDate).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    ctx.fillText(formattedDate, textX, textY);
  }

  ctx.restore();
}

/**
 * Draw a minimal badge overlay on the canvas
 * Clean, simple design with compact, semi-transparent container
 */
function drawMinimalBadgeOverlay(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  data: {
    restaurantName: string;
    dishName: string;
    rating: number;
    visitDate: string;
  },
  options: BadgeOptions
) {
  ctx.save();

  const padding = 20;
  const innerPadding = 12;
  const lineSpacing = 22;

  // Measure all text to calculate compact badge size
  const restaurantFont =
    '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const dishFont =
    '600 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const dateFont =
    '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  ctx.font = restaurantFont;
  const restaurantWidth = ctx.measureText(
    data.restaurantName.toUpperCase()
  ).width;

  ctx.font = dishFont;
  let dishName = data.dishName;
  const maxDishWidth = 400; // Maximum dish name width
  let dishWidth = ctx.measureText(dishName).width;
  while (dishWidth > maxDishWidth && dishName.length > 3) {
    dishName = dishName.slice(0, -4) + "...";
    dishWidth = ctx.measureText(dishName).width;
  }

  let dateWidth = 0;
  if (options.showDate) {
    ctx.font = dateFont;
    const formattedDate = new Date(data.visitDate).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    dateWidth = ctx.measureText(formattedDate).width;
  }

  // Calculate badge dimensions (compact to fit content)
  const contentWidth = Math.max(restaurantWidth, dishWidth, dateWidth);
  let badgeWidth = contentWidth + innerPadding * 2;
  let badgeHeight = innerPadding + 18; // Restaurant name
  badgeHeight += lineSpacing; // Dish name
  if (options.showRating) badgeHeight += lineSpacing + 4;
  if (options.showDate) badgeHeight += lineSpacing - 2;
  badgeHeight += innerPadding / 2;

  // Calculate position based on options
  let badgeX: number;
  const badgeY = canvasHeight - badgeHeight - padding;

  if (options.position === "bottom-left") {
    badgeX = padding;
  } else if (options.position === "bottom-right") {
    badgeX = canvasWidth - badgeWidth - padding;
  } else {
    // bottom (centered)
    badgeX = (canvasWidth - badgeWidth) / 2;
  }

  // Draw semi-transparent background with rounded corners
  ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 8);
  ctx.fill();

  // Draw text content
  const textX = badgeX + innerPadding;
  let textY = badgeY + innerPadding + 13;

  // Restaurant name (top, smaller, uppercase)
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.font = restaurantFont;
  ctx.textAlign = "left";
  ctx.fillText(data.restaurantName.toUpperCase(), textX, textY);

  // Dish name (middle, larger, bold)
  textY += lineSpacing;
  ctx.fillStyle = "#000000";
  ctx.font = dishFont;
  ctx.fillText(dishName, textX, textY);

  // Rating label below dish name - only if showRating is true
  if (options.showRating) {
    textY += lineSpacing + 4;
    const ratingLabel = RATING_LABELS[data.rating - 1] || "Unknown";
    const ratingColor = RATING_COLORS[data.rating - 1] || "#6b7280";

    ctx.fillStyle = ratingColor;
    ctx.font =
      '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(ratingLabel, textX, textY);
  }

  // Date (bottom, small) - only if showDate is true
  if (options.showDate) {
    textY += lineSpacing - 2;
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.font = dateFont;

    const formattedDate = new Date(data.visitDate).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    ctx.fillText(formattedDate, textX, textY);
  }

  ctx.restore();
}

/**
 * Draw restaurant info overlay centered on the image (used for 4 and 6+ photo layouts)
 */
function drawRestaurantCenterOverlay(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  restaurantName: string,
  visitDate: string,
  options: BadgeOptions
) {
  ctx.save();

  const innerPadding = 10;
  const lineSpacing = 16;

  // Measure text - more compact for center overlays
  const restaurantFont =
    '600 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const dateFont =
    '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  ctx.font = restaurantFont;
  const restaurantWidth = ctx.measureText(restaurantName).width;

  let dateWidth = 0;
  let formattedDate = "";
  if (options.showDate) {
    formattedDate = new Date(visitDate).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    ctx.font = dateFont;
    dateWidth = ctx.measureText(formattedDate).width;
  }

  // Calculate badge dimensions
  const contentWidth = Math.max(restaurantWidth, dateWidth);
  const badgeWidth = contentWidth + innerPadding * 2;
  let badgeHeight = innerPadding + 16; // Restaurant name
  if (options.showDate) badgeHeight += lineSpacing;
  badgeHeight += innerPadding;

  const badgeX = centerX - badgeWidth / 2;
  const badgeY = centerY - badgeHeight / 2;

  if (options.theme === "minimal") {
    // Minimal style: semi-transparent white rounded container
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 10);
    ctx.fill();

    // Restaurant name
    ctx.fillStyle = "#000000";
    ctx.font = restaurantFont;
    ctx.textAlign = "center";
    ctx.fillText(restaurantName, centerX, badgeY + innerPadding + 14);

    // Date if enabled
    if (options.showDate) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.font = dateFont;
      ctx.fillText(
        formattedDate,
        centerX,
        badgeY + innerPadding + 14 + lineSpacing
      );
    }
  } else if (options.theme === "rustic") {
    // Rustic style: brown gradient
    const gradient = ctx.createLinearGradient(
      badgeX,
      badgeY,
      badgeX,
      badgeY + badgeHeight
    );
    gradient.addColorStop(0, "rgba(101, 67, 33, 0.92)");
    gradient.addColorStop(0.5, "rgba(139, 90, 43, 0.92)");
    gradient.addColorStop(1, "rgba(101, 67, 33, 0.92)");
    ctx.fillStyle = gradient;
    ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);

    // Border
    ctx.strokeStyle = "rgba(222, 184, 135, 0.6)";
    ctx.lineWidth = 2;
    ctx.strokeRect(badgeX, badgeY, badgeWidth, badgeHeight);

    // Restaurant name
    ctx.fillStyle = "#FFF8DC";
    ctx.font = '600 18px Georgia, "Times New Roman", serif';
    ctx.textAlign = "center";
    ctx.fillText(restaurantName, centerX, badgeY + innerPadding + 14);

    // Date if enabled
    if (options.showDate) {
      ctx.fillStyle = "rgba(245, 222, 179, 0.9)";
      ctx.font = "italic 12px Georgia, serif";
      ctx.fillText(
        formattedDate,
        centerX,
        badgeY + innerPadding + 14 + lineSpacing
      );
    }
  } else {
    // Modern style: dark semi-transparent with border
    ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 10);
    ctx.fill();

    // Subtle border
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Restaurant name
    ctx.fillStyle = "#ffffff";
    ctx.font = restaurantFont;
    ctx.textAlign = "center";
    ctx.fillText(restaurantName, centerX, badgeY + innerPadding + 14);

    // Date if enabled
    if (options.showDate) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.font = dateFont;
      ctx.fillText(
        formattedDate,
        centerX,
        badgeY + innerPadding + 14 + lineSpacing
      );
    }
  }

  ctx.restore();
}

/**
 * Generate a composite visit image with multiple dish photos arranged in a grid
 * Layouts vary by photo count:
 * - 2-3 photos: vertical stack (1 column)
 * - 4 photos: 2x2 grid with center overlay
 * - 5 photos: 2x3 with bottom photo spanning full width
 * - 6+ photos: 2x3 with center-bottom overlay
 */
export async function generateVisitCompositeImage(
  photos: Array<{
    file: File;
    dishName: string;
    rating: number;
  }>,
  restaurantData: {
    restaurantName: string;
    visitDate: string;
  },
  options: BadgeOptions = {
    theme: "modern",
    position: "bottom",
    showDate: true,
    showRating: true,
  }
): Promise<Blob> {
  return new Promise(async (resolve, reject) => {
    try {
      // Load all images in parallel for better performance
      const loadedImages = await Promise.all(
        photos.map(async (photo) => {
          const img = await new Promise<HTMLImageElement>((res, rej) => {
            const reader = new FileReader();
            reader.readAsDataURL(photo.file);
            reader.onload = (event) => {
              const image = new Image();
              image.src = event.target?.result as string;
              image.onload = () => res(image);
              image.onerror = () => rej(new Error("Failed to load image"));
            };
            reader.onerror = () => rej(new Error("Failed to read file"));
          });
          return {
            img,
            dishName: photo.dishName,
            rating: photo.rating,
          };
        })
      );

      // Limit to max 6 photos (2 columns x 3 rows)
      const photoCount = Math.min(loadedImages.length, 6);
      const photosToUse = loadedImages.slice(0, photoCount);

      // Warn if there are more photos than we can display
      if (loadedImages.length > 6) {
        console.warn(
          `Only the first 6 photos will be included in the composite image. ${loadedImages.length - 6} photos were omitted.`
        );
      }

      const fullWidth = 1080; // Full canvas width
      const overlayHeight = options.showDate ? 120 : 80;

      // ALL composite images are fixed at 1080 x 2280 (always)
      const canvasWidth = fullWidth;
      const canvasHeight = 2280; // Fixed height

      const photoAreaHeight = canvasHeight - overlayHeight; // 2160 with date, 2200 without

      let photoLayout: Array<{
        x: number;
        y: number;
        width: number;
        height: number;
        index: number;
      }> = [];
      let overlayPosition: {
        x: number;
        y: number;
        centerOverlay: boolean;
      } | null = null;

      // Determine layout based on photo count (all layouts fill 1080 x 2160 photo area)
      if (photoCount === 2) {
        // 2 photos: vertical stack, each 1080 x 1080
        const photoHeight = photoAreaHeight / 2; // 1080

        for (let i = 0; i < 2; i++) {
          photoLayout.push({
            x: 0,
            y: photoHeight * i,
            width: fullWidth,
            height: photoHeight,
            index: i,
          });
        }

        overlayPosition = {
          x: 0,
          y: photoAreaHeight,
          centerOverlay: false,
        };
      } else if (photoCount === 3) {
        // 3 photos: vertical stack, 3 rows
        const rowHeight = photoAreaHeight / 3; // 720 with date, ~733 without

        for (let i = 0; i < 3; i++) {
          photoLayout.push({
            x: 0,
            y: rowHeight * i,
            width: fullWidth,
            height: rowHeight,
            index: i,
          });
        }

        overlayPosition = {
          x: 0,
          y: photoAreaHeight,
          centerOverlay: false,
        };
      } else if (photoCount === 4) {
        // 4 photos: 2x2 grid, use full canvas height (overlay is centered on top)
        const rowHeight = canvasHeight / 2; // 1140 (full height)
        const halfWidth = fullWidth / 2; // 540

        for (let i = 0; i < 4; i++) {
          const col = i % 2;
          const row = Math.floor(i / 2);
          photoLayout.push({
            x: col * halfWidth,
            y: row * rowHeight,
            width: halfWidth,
            height: rowHeight,
            index: i,
          });
        }

        overlayPosition = {
          x: fullWidth / 2,
          y: canvasHeight / 2,
          centerOverlay: true,
        };
      } else if (photoCount === 5) {
        // 5 photos: 3 rows, each 720px tall
        // Top 2 rows: 4 photos in 2x2 (540 x 720 each)
        // Bottom row: 1 photo (1080 x 720)
        const rowHeight = photoAreaHeight / 3; // 720
        const halfWidth = fullWidth / 2; // 540

        // Top 4 photos in 2x2
        for (let i = 0; i < 4; i++) {
          const col = i % 2;
          const row = Math.floor(i / 2);
          photoLayout.push({
            x: col * halfWidth,
            y: row * rowHeight,
            width: halfWidth,
            height: rowHeight,
            index: i,
          });
        }

        // Bottom photo spanning full width
        photoLayout.push({
          x: 0,
          y: rowHeight * 2,
          width: fullWidth,
          height: rowHeight,
          index: 4,
        });

        overlayPosition = {
          x: 0,
          y: photoAreaHeight,
          centerOverlay: false,
        };
      } else {
        // 6 photos: 2x3 grid, use full canvas height (overlay is centered on top)
        const rowHeight = canvasHeight / 3; // 760 (full height)
        const halfWidth = fullWidth / 2; // 540

        for (let i = 0; i < 6; i++) {
          const col = i % 2;
          const row = Math.floor(i / 2);
          photoLayout.push({
            x: col * halfWidth,
            y: row * rowHeight,
            width: halfWidth,
            height: rowHeight,
            index: i,
          });
        }

        overlayPosition = {
          x: fullWidth / 2,
          y: canvasHeight - rowHeight / 2,
          centerOverlay: true,
        };
      }

      const canvas = document.createElement("canvas");
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      // Fill background
      ctx.fillStyle = "#f3f4f6"; // gray-100
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // Draw each photo in layout with dish name and rating
      for (const layout of photoLayout) {
        const { img, dishName, rating } = photosToUse[layout.index];
        const { x, y, width, height } = layout;

        // Calculate scaling to cover the photo area
        const scale = Math.max(width / img.width, height / img.height);
        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;
        const offsetX = (width - scaledWidth) / 2;
        const offsetY = (height - scaledHeight) / 2;

        // Clip to photo boundaries to prevent overflow
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, width, height);
        ctx.clip();

        // Draw the photo
        ctx.drawImage(img, x + offsetX, y + offsetY, scaledWidth, scaledHeight);

        ctx.restore();

        // Add subtle border between photos
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 4;
        ctx.strokeRect(x, y, width, height);

        // Draw dish name and rating overlay at bottom of each photo
        if (options.theme === "minimal") {
          // Minimal style: compact semi-transparent container
          const innerPadding = 12;
          const lineSpacing = 40;

          // Measure text for compact size using actual font sizes
          const dishFont =
            '600 42px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          const ratingFont =
            '600 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

          ctx.font = dishFont;
          let displayName = dishName;
          const maxDishWidth = width - 60;
          let dishWidth = ctx.measureText(displayName).width;
          while (dishWidth > maxDishWidth && displayName.length > 3) {
            displayName = displayName.slice(0, -4) + "...";
            dishWidth = ctx.measureText(displayName).width;
          }

          let ratingWidth = 0;
          let ratingLabel = "";
          if (options.showRating) {
            ratingLabel = RATING_LABELS[rating - 1] || "Unknown";
            ctx.font = ratingFont;
            ratingWidth = ctx.measureText(ratingLabel).width;
          }

          const contentWidth = Math.max(dishWidth, ratingWidth);
          const badgeWidth = contentWidth + innerPadding * 2;
          let badgeHeight = innerPadding + 42; // Dish name height
          if (options.showRating) badgeHeight += lineSpacing;
          badgeHeight += innerPadding;

          const badgeX = x + (width - badgeWidth) / 2;
          const badgeY = y + height - badgeHeight - 12;

          // Draw compact rounded container
          ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 8);
          ctx.fill();

          // Draw dish name
          ctx.fillStyle = "#000000";
          ctx.font = dishFont;
          ctx.textAlign = "center";
          ctx.fillText(
            displayName,
            badgeX + badgeWidth / 2,
            badgeY + innerPadding + 34
          );

          // Draw rating if enabled
          if (options.showRating) {
            const ratingColor = RATING_COLORS[rating - 1] || "#6b7280";
            ctx.fillStyle = ratingColor;
            ctx.font = ratingFont;
            ctx.fillText(
              ratingLabel,
              badgeX + badgeWidth / 2,
              badgeY + innerPadding + 34 + lineSpacing
            );
          }

          ctx.textAlign = "left";
        } else if (options.theme === "rustic") {
          // Rustic style: compact banner badge with brown gradient
          const innerPadding = 12;
          const lineSpacing = 40;

          const dishFont = 'bold 42px Georgia, "Times New Roman", serif';
          const ratingFont = 'bold 32px Georgia, serif';

          ctx.font = dishFont;
          let displayName = dishName;
          const maxDishWidth = width - 60;
          let dishWidth = ctx.measureText(displayName).width;
          while (dishWidth > maxDishWidth && displayName.length > 3) {
            displayName = displayName.slice(0, -4) + "...";
            dishWidth = ctx.measureText(displayName).width;
          }

          let ratingWidth = 0;
          let ratingLabel = "";
          if (options.showRating) {
            ratingLabel = RATING_LABELS[rating - 1] || "Unknown";
            ctx.font = ratingFont;
            ratingWidth = ctx.measureText(ratingLabel).width;
          }

          const contentWidth = Math.max(dishWidth, ratingWidth);
          const badgeWidth = contentWidth + innerPadding * 2;
          let badgeHeight = innerPadding + 42;
          if (options.showRating) badgeHeight += lineSpacing;
          badgeHeight += innerPadding;

          const badgeX = x + (width - badgeWidth) / 2;
          const badgeY = y + height - badgeHeight - 12;

          // Draw rustic gradient badge
          const gradient = ctx.createLinearGradient(
            badgeX,
            badgeY,
            badgeX,
            badgeY + badgeHeight
          );
          gradient.addColorStop(0, "rgba(101, 67, 33, 0.92)");
          gradient.addColorStop(0.5, "rgba(139, 90, 43, 0.92)");
          gradient.addColorStop(1, "rgba(101, 67, 33, 0.92)");
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 8);
          ctx.fill();

          // Add texture (reduced for performance)
          ctx.globalAlpha = 0.1;
          for (let i = 0; i < 15; i++) {
            const tx = badgeX + Math.random() * badgeWidth;
            const ty = badgeY + Math.random() * badgeHeight;
            ctx.fillStyle =
              Math.random() > 0.5 ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";
            ctx.fillRect(tx, ty, 2, 2);
          }
          ctx.globalAlpha = 1;

          // Draw dish name
          ctx.fillStyle = "#FFF8DC";
          ctx.font = dishFont;
          ctx.textAlign = "center";
          ctx.fillText(
            displayName,
            badgeX + badgeWidth / 2,
            badgeY + innerPadding + 34
          );

          // Draw rating if enabled
          if (options.showRating) {
            ctx.fillStyle = "#F5DEB3";
            ctx.font = ratingFont;
            ctx.fillText(
              ratingLabel,
              badgeX + badgeWidth / 2,
              badgeY + innerPadding + 34 + lineSpacing
            );
          }

          ctx.textAlign = "left";
        } else {
          // Modern style: compact banner badge with dark gradient
          const innerPadding = 12;
          const lineSpacing = 40;

          const dishFont =
            'bold 42px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          const ratingFont =
            'bold 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

          ctx.font = dishFont;
          let displayName = dishName;
          const maxDishWidth = width - 60;
          let dishWidth = ctx.measureText(displayName).width;
          while (dishWidth > maxDishWidth && displayName.length > 3) {
            displayName = displayName.slice(0, -4) + "...";
            dishWidth = ctx.measureText(displayName).width;
          }

          let ratingWidth = 0;
          let ratingLabel = "";
          if (options.showRating) {
            ratingLabel = RATING_LABELS[rating - 1] || "Unknown";
            ctx.font = ratingFont;
            ratingWidth = ctx.measureText(ratingLabel).width;
          }

          const contentWidth = Math.max(dishWidth, ratingWidth);
          const badgeWidth = contentWidth + innerPadding * 2;
          let badgeHeight = innerPadding + 42;
          if (options.showRating) badgeHeight += lineSpacing;
          badgeHeight += innerPadding;

          const badgeX = x + (width - badgeWidth) / 2;
          const badgeY = y + height - badgeHeight - 12;

          // Draw modern gradient badge
          const gradient = ctx.createLinearGradient(
            badgeX,
            badgeY,
            badgeX,
            badgeY + badgeHeight
          );
          gradient.addColorStop(0, "rgba(0, 0, 0, 0.75)");
          gradient.addColorStop(1, "rgba(0, 0, 0, 0.9)");
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 8);
          ctx.fill();

          // Add subtle border
          ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
          ctx.lineWidth = 2;
          ctx.stroke();

          // Draw dish name
          ctx.fillStyle = "#ffffff";
          ctx.font = dishFont;
          ctx.textAlign = "center";
          ctx.fillText(
            displayName,
            badgeX + badgeWidth / 2,
            badgeY + innerPadding + 34
          );

          // Draw rating if enabled
          if (options.showRating) {
            ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
            ctx.font = ratingFont;
            ctx.fillText(
              ratingLabel,
              badgeX + badgeWidth / 2,
              badgeY + innerPadding + 34 + lineSpacing
            );
          }

          ctx.textAlign = "left";
        }
      }

      // Draw restaurant overlay
      if (overlayPosition) {
        if (overlayPosition.centerOverlay) {
          // Center overlay (for 4 and 6+ photos) - compact badge on top of photos
          drawRestaurantCenterOverlay(
            ctx,
            overlayPosition.x,
            overlayPosition.y,
            restaurantData.restaurantName,
            restaurantData.visitDate,
            options
          );
        } else {
          // Bottom overlay (for 2-3 and 5 photos) - full-width section
          const overlayY = overlayPosition.y;

          if (options.theme === "minimal") {
            // Minimal style: more transparent white background
            ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
            ctx.fillRect(0, overlayY, canvasWidth, overlayHeight);

            // Restaurant name (dark text)
            ctx.fillStyle = "#000000";
            ctx.font =
              '600 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.textAlign = "center";
            ctx.fillText(
              restaurantData.restaurantName,
              canvasWidth / 2,
              overlayY + 48
            );

            // Date if enabled
            if (options.showDate) {
              ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
              ctx.font =
                '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
              const formattedDate = new Date(
                restaurantData.visitDate
              ).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              });
              ctx.fillText(formattedDate, canvasWidth / 2, overlayY + 78);
            }
          } else if (options.theme === "rustic") {
            // Rustic style overlay
            const gradient = ctx.createLinearGradient(
              0,
              overlayY,
              0,
              overlayY + overlayHeight
            );
            gradient.addColorStop(0, "rgba(101, 67, 33, 0.95)");
            gradient.addColorStop(0.5, "rgba(139, 90, 43, 0.95)");
            gradient.addColorStop(1, "rgba(101, 67, 33, 0.95)");
            ctx.fillStyle = gradient;
            ctx.fillRect(0, overlayY, canvasWidth, overlayHeight);

            // Add texture (reduced for performance)
            ctx.globalAlpha = 0.1;
            for (let i = 0; i < 50; i++) {
              const x = Math.random() * canvasWidth;
              const y = overlayY + Math.random() * overlayHeight;
              ctx.fillStyle =
                Math.random() > 0.5
                  ? "rgba(255,255,255,0.5)"
                  : "rgba(0,0,0,0.5)";
              ctx.fillRect(x, y, 2, 2);
            }
            ctx.globalAlpha = 1;

            // Draw decorative line at top
            ctx.strokeStyle = "rgba(222, 184, 135, 0.6)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(20, overlayY + 10);
            ctx.lineTo(canvasWidth - 20, overlayY + 10);
            ctx.stroke();

            // Restaurant name
            ctx.fillStyle = "#FFF8DC";
            ctx.font = 'bold 32px Georgia, "Times New Roman", serif';
            ctx.textAlign = "center";
            ctx.fillText(
              restaurantData.restaurantName,
              canvasWidth / 2,
              overlayY + 50
            );

            // Date if enabled
            if (options.showDate) {
              ctx.fillStyle = "rgba(245, 222, 179, 0.9)";
              ctx.font = "italic 18px Georgia, serif";
              const formattedDate = new Date(
                restaurantData.visitDate
              ).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              });
              ctx.fillText(formattedDate, canvasWidth / 2, overlayY + 85);
            }
          } else {
            // Modern style overlay
            ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
            ctx.fillRect(0, overlayY, canvasWidth, overlayHeight);

            // Subtle border at top
            ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, overlayY);
            ctx.lineTo(canvasWidth, overlayY);
            ctx.stroke();

            // Restaurant name
            ctx.fillStyle = "#ffffff";
            ctx.font =
              'bold 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.textAlign = "center";
            ctx.fillText(
              restaurantData.restaurantName,
              canvasWidth / 2,
              overlayY + 50
            );

            // Date if enabled
            if (options.showDate) {
              ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
              ctx.font =
                '18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
              const formattedDate = new Date(
                restaurantData.visitDate
              ).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              });
              ctx.fillText(formattedDate, canvasWidth / 2, overlayY + 85);
            }
          }
        }
      }

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to generate composite image"));
            return;
          }
          resolve(blob);
        },
        "image/jpeg",
        0.92
      );
    } catch (error) {
      reject(error);
    }
  });
}
