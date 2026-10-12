package api

import (
	"errors"
	"net/http"

	"github.com/dante0416/calculator/backend/internal/calculator"
)

const (
	codeInvalidJSON      = "INVALID_JSON"
	codeUnknownOperation = "UNKNOWN_OPERATION"
	codeMissingOperand   = "MISSING_OPERAND"
	codeDivisionByZero   = "DIVISION_BY_ZERO"
	codeNegativeSqrt     = "NEGATIVE_SQRT"
	codeInvalidResult    = "INVALID_RESULT"
	codeInternalError    = "INTERNAL_ERROR"

	messageInvalidJSON      = "Request body must be valid JSON matching the API contract."
	messageUnknownOperation = "The operation is missing or not supported."
	messageMissingOperand   = "A required operand is missing."
	messageInternalError    = "An unexpected error occurred."
)

// mapDomainError translates a calculator error into an HTTP status, code and message.
func mapDomainError(err error) (status int, code, message string) {
	switch {
	case errors.Is(err, calculator.ErrDivisionByZero):
		return http.StatusUnprocessableEntity, codeDivisionByZero, "Division by zero is not allowed."
	case errors.Is(err, calculator.ErrNegativeSqrt):
		return http.StatusUnprocessableEntity, codeNegativeSqrt, "Square root of a negative number is not allowed."
	case errors.Is(err, calculator.ErrInvalidResult):
		return http.StatusUnprocessableEntity, codeInvalidResult, "The result is not a finite number."
	case errors.Is(err, calculator.ErrUnknownOperation):
		return http.StatusBadRequest, codeUnknownOperation, messageUnknownOperation
	default:
		return http.StatusInternalServerError, codeInternalError, messageInternalError
	}
}
