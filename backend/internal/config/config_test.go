package config

import "testing"

func TestLoad(t *testing.T) {
	tests := []struct {
		name string
		env  map[string]string
		want Config
	}{
		{
			name: "defaults when unset",
			env:  map[string]string{"PORT": "", "CORS_ALLOWED_ORIGIN": "", "STATIC_DIR": ""},
			want: Config{Port: "8080", CORSOrigin: "http://localhost:5173"},
		},
		{
			name: "overrides from environment",
			env:  map[string]string{"PORT": "9090", "CORS_ALLOWED_ORIGIN": "https://calc.example.com", "STATIC_DIR": "/app/public"},
			want: Config{Port: "9090", CORSOrigin: "https://calc.example.com", StaticDir: "/app/public"},
		},
		{
			name: "partial override",
			env:  map[string]string{"PORT": "3001", "CORS_ALLOWED_ORIGIN": "", "STATIC_DIR": ""},
			want: Config{Port: "3001", CORSOrigin: "http://localhost:5173"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			for key, value := range tt.env {
				t.Setenv(key, value)
			}
			if got := Load(); got != tt.want {
				t.Errorf("Load() = %+v, want %+v", got, tt.want)
			}
		})
	}
}
