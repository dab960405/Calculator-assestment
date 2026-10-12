// Package calculator implements pure arithmetic operations with domain errors.
package calculator

import "math"

// Operation identifies a supported arithmetic operation.
type Operation string

const (
	// Add returns a + b.
	Add Operation = "add"
	// Subtract returns a - b.
	Subtract Operation = "subtract"
	// Multiply returns a * b.
	Multiply Operation = "multiply"
	// Divide returns a / b and fails when b is zero.
	Divide Operation = "divide"
	// Power returns a raised to b.
	Power Operation = "power"
	// Sqrt returns the square root of a and fails when a is negative. It is unary.
	Sqrt Operation = "sqrt"
	// Percentage returns a percent of b, that is a * b / 100 (a=15, b=200 gives 30).
	Percentage Operation = "percentage"
)

// ParseOperation validates a raw string and returns ErrUnknownOperation if unsupported.
func ParseOperation(s string) (Operation, error) {
	switch op := Operation(s); op {
	case Add, Subtract, Multiply, Divide, Power, Sqrt, Percentage:
		return op, nil
	default:
		return "", ErrUnknownOperation
	}
}

// IsUnary reports whether the operation only uses operand a.
func (o Operation) IsUnary() bool {
	return o == Sqrt
}

// Calculate runs op over a and b. For unary operations b is ignored.
func Calculate(op Operation, a, b float64) (float64, error) {
	result, err := compute(op, a, b)
	if err != nil {
		return 0, err
	}
	if math.IsNaN(result) || math.IsInf(result, 0) {
		return 0, ErrInvalidResult
	}
	return result, nil
}

func compute(op Operation, a, b float64) (float64, error) {
	switch op {
	case Add:
		return a + b, nil
	case Subtract:
		return a - b, nil
	case Multiply:
		return a * b, nil
	case Divide:
		if b == 0 {
			return 0, ErrDivisionByZero
		}
		return a / b, nil
	case Power:
		return math.Pow(a, b), nil
	case Sqrt:
		if a < 0 {
			return 0, ErrNegativeSqrt
		}
		return math.Sqrt(a), nil
	case Percentage:
		return a * b / 100, nil
	default:
		return 0, ErrUnknownOperation
	}
}
