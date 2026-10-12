package api

// calculateRequest is the JSON body of POST /api/v1/calculate.
// Pointers distinguish "field missing" from "field is 0".
type calculateRequest struct {
	Operation string   `json:"operation"`
	A         *float64 `json:"a"`
	B         *float64 `json:"b"`
}

type calculateResponse struct {
	Result float64 `json:"result"`
}

type healthResponse struct {
	Status string `json:"status"`
}

type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type errorResponse struct {
	Error errorBody `json:"error"`
}
