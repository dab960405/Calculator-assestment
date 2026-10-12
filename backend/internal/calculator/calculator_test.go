package calculator

import (
	"errors"
	"math"
	"testing"
)

func TestParseOperation(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    Operation
		wantErr error
	}{
		{name: "add", input: "add", want: Add},
		{name: "subtract", input: "subtract", want: Subtract},
		{name: "multiply", input: "multiply", want: Multiply},
		{name: "divide", input: "divide", want: Divide},
		{name: "power", input: "power", want: Power},
		{name: "sqrt", input: "sqrt", want: Sqrt},
		{name: "percentage", input: "percentage", want: Percentage},
		{name: "empty", input: "", wantErr: ErrUnknownOperation},
		{name: "unknown", input: "modulo", wantErr: ErrUnknownOperation},
		{name: "case sensitive", input: "ADD", wantErr: ErrUnknownOperation},
		{name: "surrounding spaces", input: " add ", wantErr: ErrUnknownOperation},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseOperation(tt.input)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("ParseOperation(%q) error = %v, want %v", tt.input, err, tt.wantErr)
			}
			if got != tt.want {
				t.Errorf("ParseOperation(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestIsUnary(t *testing.T) {
	tests := []struct {
		op   Operation
		want bool
	}{
		{Add, false},
		{Subtract, false},
		{Multiply, false},
		{Divide, false},
		{Power, false},
		{Sqrt, true},
		{Percentage, false},
	}

	for _, tt := range tests {
		t.Run(string(tt.op), func(t *testing.T) {
			if got := tt.op.IsUnary(); got != tt.want {
				t.Errorf("%q.IsUnary() = %v, want %v", tt.op, got, tt.want)
			}
		})
	}
}

func TestCalculate(t *testing.T) {
	const tolerance = 1e-12

	tests := []struct {
		name string
		op   Operation
		a, b float64
		want float64
	}{
		{name: "add integers", op: Add, a: 2, b: 3, want: 5},
		{name: "add negatives", op: Add, a: -2, b: -3, want: -5},
		{name: "add decimals 0.1+0.2", op: Add, a: 0.1, b: 0.2, want: 0.3},
		{name: "add opposite zero", op: Add, a: 5, b: -5, want: 0},
		{name: "subtract", op: Subtract, a: 10, b: 4, want: 6},
		{name: "subtract to negative", op: Subtract, a: 4, b: 10, want: -6},
		{name: "multiply", op: Multiply, a: 6, b: 7, want: 42},
		{name: "multiply negatives", op: Multiply, a: -6, b: -7, want: 42},
		{name: "multiply by zero", op: Multiply, a: 123, b: 0, want: 0},
		{name: "divide", op: Divide, a: 10, b: 4, want: 2.5},
		{name: "divide negative", op: Divide, a: -9, b: 3, want: -3},
		{name: "divide zero numerator", op: Divide, a: 0, b: 5, want: 0},
		{name: "power", op: Power, a: 2, b: 10, want: 1024},
		{name: "power zero exponent", op: Power, a: 7, b: 0, want: 1},
		{name: "power negative exponent", op: Power, a: 2, b: -2, want: 0.25},
		{name: "power negative base odd", op: Power, a: -2, b: 3, want: -8},
		{name: "sqrt", op: Sqrt, a: 9, want: 3},
		{name: "sqrt zero", op: Sqrt, a: 0, want: 0},
		{name: "sqrt ignores b", op: Sqrt, a: 16, b: -999, want: 4},
		{name: "percentage", op: Percentage, a: 15, b: 200, want: 30},
		{name: "percentage negative", op: Percentage, a: -10, b: 50, want: -5},
		{name: "very large", op: Add, a: 1e300, b: 1e300, want: 2e300},
		{name: "max float", op: Multiply, a: math.MaxFloat64, b: 1, want: math.MaxFloat64},
		{name: "very small", op: Multiply, a: 1e-200, b: 1e-100, want: 1e-300},
		{name: "underflow to zero", op: Multiply, a: 1e-300, b: 1e-300, want: 0},
		{name: "smallest subnormal", op: Divide, a: math.SmallestNonzeroFloat64, b: 1, want: math.SmallestNonzeroFloat64},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Calculate(tt.op, tt.a, tt.b)
			if err != nil {
				t.Fatalf("Calculate(%q, %v, %v) unexpected error: %v", tt.op, tt.a, tt.b, err)
			}
			if !closeEnough(got, tt.want, tolerance) {
				t.Errorf("Calculate(%q, %v, %v) = %v, want %v", tt.op, tt.a, tt.b, got, tt.want)
			}
		})
	}
}

func TestCalculateFloatingPointIsNotRounded(t *testing.T) {
	a, b := 0.1, 0.2
	got, err := Calculate(Add, a, b)
	if err != nil {
		t.Fatal(err)
	}
	if got != a+b || got == 0.3 {
		t.Errorf("Calculate(add, 0.1, 0.2) = %v, want the raw IEEE-754 sum 0.30000000000000004", got)
	}
}

func TestCalculateErrors(t *testing.T) {
	tests := []struct {
		name    string
		op      Operation
		a, b    float64
		wantErr error
	}{
		{name: "divide by zero", op: Divide, a: 1, b: 0, wantErr: ErrDivisionByZero},
		{name: "divide zero by zero", op: Divide, a: 0, b: 0, wantErr: ErrDivisionByZero},
		{name: "divide by negative zero", op: Divide, a: 1, b: math.Copysign(0, -1), wantErr: ErrDivisionByZero},
		{name: "sqrt negative", op: Sqrt, a: -4, wantErr: ErrNegativeSqrt},
		{name: "sqrt tiny negative", op: Sqrt, a: -1e-300, wantErr: ErrNegativeSqrt},
		{name: "unknown operation", op: Operation("modulo"), a: 1, b: 2, wantErr: ErrUnknownOperation},
		{name: "empty operation", op: Operation(""), a: 1, b: 2, wantErr: ErrUnknownOperation},
		{name: "add overflow", op: Add, a: math.MaxFloat64, b: math.MaxFloat64, wantErr: ErrInvalidResult},
		{name: "subtract overflow", op: Subtract, a: -math.MaxFloat64, b: math.MaxFloat64, wantErr: ErrInvalidResult},
		{name: "multiply overflow", op: Multiply, a: 1e200, b: 1e200, wantErr: ErrInvalidResult},
		{name: "divide overflow", op: Divide, a: math.MaxFloat64, b: 0.5, wantErr: ErrInvalidResult},
		{name: "power overflow", op: Power, a: 10, b: 400, wantErr: ErrInvalidResult},
		{name: "power zero to negative is Inf", op: Power, a: 0, b: -1, wantErr: ErrInvalidResult},
		{name: "power negative base fractional exponent is NaN", op: Power, a: -8, b: 0.5, wantErr: ErrInvalidResult},
		{name: "percentage overflow", op: Percentage, a: math.MaxFloat64, b: math.MaxFloat64, wantErr: ErrInvalidResult},
		{name: "NaN input", op: Add, a: math.NaN(), b: 1, wantErr: ErrInvalidResult},
		{name: "+Inf input", op: Add, a: math.Inf(1), b: 1, wantErr: ErrInvalidResult},
		{name: "-Inf input", op: Multiply, a: math.Inf(-1), b: 2, wantErr: ErrInvalidResult},
		{name: "Inf minus Inf", op: Subtract, a: math.Inf(1), b: math.Inf(1), wantErr: ErrInvalidResult},
		{name: "sqrt +Inf", op: Sqrt, a: math.Inf(1), wantErr: ErrInvalidResult},
		{name: "sqrt NaN", op: Sqrt, a: math.NaN(), wantErr: ErrInvalidResult},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Calculate(tt.op, tt.a, tt.b)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("Calculate(%q, %v, %v) error = %v, want %v", tt.op, tt.a, tt.b, err, tt.wantErr)
			}
			if got != 0 {
				t.Errorf("Calculate(%q, %v, %v) = %v on error, want 0", tt.op, tt.a, tt.b, got)
			}
		})
	}
}

func TestErrorsAreDistinct(t *testing.T) {
	all := []error{ErrDivisionByZero, ErrNegativeSqrt, ErrUnknownOperation, ErrInvalidResult}
	for i, a := range all {
		for j, b := range all {
			if i != j && errors.Is(a, b) {
				t.Errorf("errors.Is(%v, %v) = true, want distinct sentinel errors", a, b)
			}
		}
	}
}

func closeEnough(got, want, tolerance float64) bool {
	if got == want {
		return true
	}
	diff := math.Abs(got - want)
	scale := math.Max(math.Abs(got), math.Abs(want))
	return diff <= tolerance*scale
}
