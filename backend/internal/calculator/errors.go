package calculator

import "errors"

var (
	// ErrDivisionByZero is returned when dividing by zero.
	ErrDivisionByZero = errors.New("division by zero")
	// ErrNegativeSqrt is returned when taking the square root of a negative number.
	ErrNegativeSqrt = errors.New("square root of a negative number")
	// ErrUnknownOperation is returned when the operation is not supported.
	ErrUnknownOperation = errors.New("unknown operation")
	// ErrInvalidResult is returned when the result is NaN or ±Inf.
	ErrInvalidResult = errors.New("result is not a finite number")
)
