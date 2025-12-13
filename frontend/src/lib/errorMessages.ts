/**
 * Centralized error messages for the application
 * Organized by feature/domain for consistency and maintainability
 */

export const ERROR_MESSAGES = {
  // Validation errors
  VALIDATION: {
    REQUIRED_FIELD: (field: string) => `${field} is required`,
    MIN_LENGTH: (field: string, length: number) =>
      `${field} must be at least ${length} characters`,
    MAX_LENGTH: (field: string, length: number) =>
      `${field} must be ${length} characters or less`,
    PASSWORDS_MISMATCH: "Passwords do not match",
    INVALID_EMAIL: "Please enter a valid email address",
  },

  // Authentication errors
  AUTH: {
    INVALID_CREDENTIALS: "Invalid email or password. Please try again.",
    RESET_PASSWORD_FAILED:
      "Failed to reset password. The link may be invalid or expired.",
    SEND_RESET_EMAIL_FAILED:
      "Failed to send password reset email. Please check your email address and try again.",
  },

  // Restaurant errors
  RESTAURANT: {
    CREATE_FAILED: "Failed to create restaurant",
    UPDATE_FAILED: "Failed to update restaurant",
    DELETE_FAILED: "Failed to delete restaurant",
    FETCH_FAILED: "Failed to load restaurants",
  },

  // Friend errors
  FRIENDS: {
    CODE_NOT_FOUND: "Friend code not found",
    CANNOT_ADD_SELF: "Cannot add yourself as a friend",
    REQUEST_EXISTS: "Friend request already exists",
    SEND_REQUEST_FAILED: "Failed to send friend request",
    CODE_REQUIRED: "Please enter a friend code",
    OFFLINE_LOOKUP:
      "Friend code lookup requires internet connection. Please connect and try again.",
  },

  // List errors
  LISTS: {
    CREATE_FAILED: "Failed to create list",
    ADD_TO_LIST_FAILED: "Failed to add to lists",
    SELECT_AT_LEAST_ONE: "Please select at least one list",
  },

  // OCR/Camera errors
  OCR: {
    IMAGE_TOO_LARGE: "Image is too large. Please select an image under 10MB",
    INVALID_FILE_TYPE: "Please select an image file (JPEG, PNG, etc.)",
    OFFLINE_REQUIRED:
      "OCR requires an internet connection. Please connect and try again.",
    NO_TEXT_DETECTED:
      "No text detected in the image. Try another image with clearer text.",
    EXTRACTION_FAILED: (error: string) =>
      `Failed to extract text: ${error}. Please try another image.`,
    COPY_FAILED: "Failed to copy text to clipboard",
  },

  // Generic errors
  GENERIC: {
    NETWORK_ERROR: "Network error. Please check your connection.",
    UNKNOWN_ERROR: "An unexpected error occurred. Please try again.",
    DELETE_FAILED: (item: string) => `Failed to delete ${item}. Please try again.`,
    UPDATE_FAILED: (item: string) => `Failed to update ${item}. Please try again.`,
    CREATE_FAILED: (item: string) => `Failed to create ${item}. Please try again.`,
  },
} as const;
