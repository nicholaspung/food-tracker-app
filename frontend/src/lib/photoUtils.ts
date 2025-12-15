import { logger } from '@/lib/logger';
import ExifReader from "exifreader";

/**
 * Extracts the capture date from image EXIF data
 * Falls back to file modification date if EXIF data is unavailable
 *
 * @param file - The image file to extract date from
 * @returns The capture date or null if unavailable
 */
export async function extractImageCaptureDate(file: File): Promise<Date | null> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const tags = ExifReader.load(arrayBuffer);

    // Try different date tags in order of preference
    const dateTag =
      tags["DateTimeOriginal"] || tags["DateTime"] || tags["CreateDate"];

    if (dateTag && dateTag.description) {
      // EXIF date format is "YYYY:MM:DD HH:MM:SS"
      const dateStr = dateTag.description;
      const [datePart, timePart] = dateStr.split(" ");
      const [year, month, day] = datePart.split(":");
      const [hour, minute, second] = timePart?.split(":") || ["00", "00", "00"];

      const date = new Date(
        parseInt(year),
        parseInt(month) - 1, // Month is 0-indexed
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second)
      );

      // Validate the date
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  } catch (error) {
    logger.warn("Failed to extract EXIF date from image:", error);
  }

  // Fallback to file modification date or current date
  return file.lastModified ? new Date(file.lastModified) : new Date();
}
