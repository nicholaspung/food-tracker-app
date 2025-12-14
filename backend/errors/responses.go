package errors

// ErrorResponse provides a structured error response for the frontend
type ErrorResponse struct {
	Success bool   `json:"success"`
	Error   string `json:"error"`
	Code    string `json:"code"`
	Details any    `json:"details,omitempty"`
}

// Common error codes for frontend error handling
const (
	ErrCodeBadRequest     = "BAD_REQUEST"
	ErrCodeUnauthorized   = "UNAUTHORIZED"
	ErrCodeForbidden      = "FORBIDDEN"
	ErrCodeNotFound       = "NOT_FOUND"
	ErrCodeRateLimit      = "RATE_LIMITED"
	ErrCodeInvalidCode    = "INVALID_INVITE_CODE"
	ErrCodeInternal       = "INTERNAL_ERROR"
	ErrCodeNotMenu        = "NOT_MENU_IMAGE"
	ErrCodeNotRestaurant  = "NOT_RESTAURANT_IMAGE"
)

// BadRequest creates a bad request error response
func BadRequest(message string) ErrorResponse {
	return ErrorResponse{
		Success: false,
		Error:   message,
		Code:    ErrCodeBadRequest,
	}
}

// BadRequestWithDetails creates a bad request error response with additional details
func BadRequestWithDetails(message string, details any) ErrorResponse {
	return ErrorResponse{
		Success: false,
		Error:   message,
		Code:    ErrCodeBadRequest,
		Details: details,
	}
}

// Unauthorized creates an unauthorized error response
func Unauthorized(message string) ErrorResponse {
	return ErrorResponse{
		Success: false,
		Error:   message,
		Code:    ErrCodeUnauthorized,
	}
}

// Forbidden creates a forbidden error response
func Forbidden(message string) ErrorResponse {
	return ErrorResponse{
		Success: false,
		Error:   message,
		Code:    ErrCodeForbidden,
	}
}

// NotFound creates a not found error response
func NotFound(message string) ErrorResponse {
	return ErrorResponse{
		Success: false,
		Error:   message,
		Code:    ErrCodeNotFound,
	}
}

// RateLimit creates a rate limit error response with remaining time
func RateLimit(remainingMinutes int) ErrorResponse {
	return ErrorResponse{
		Success: false,
		Error:   "too many failed attempts, please try again later",
		Code:    ErrCodeRateLimit,
		Details: map[string]any{
			"remainingMinutes": remainingMinutes,
		},
	}
}

// InvalidInviteCode creates an invalid invite code error response
func InvalidInviteCode() ErrorResponse {
	return ErrorResponse{
		Success: false,
		Error:   "invalid or already used invite code",
		Code:    ErrCodeInvalidCode,
	}
}

// Internal creates an internal server error response
func Internal(message string) ErrorResponse {
	return ErrorResponse{
		Success: false,
		Error:   message,
		Code:    ErrCodeInternal,
	}
}

// NotMenuImage creates an error response for non-menu images
func NotMenuImage() ErrorResponse {
	return ErrorResponse{
		Success: false,
		Error:   "image is not a menu",
		Code:    ErrCodeNotMenu,
	}
}

// NotRestaurantImage creates an error response for non-restaurant images
func NotRestaurantImage(reason string) ErrorResponse {
	return ErrorResponse{
		Success: false,
		Error:   "image does not appear to be restaurant-related",
		Code:    ErrCodeNotRestaurant,
		Details: map[string]any{
			"reason": reason,
		},
	}
}
