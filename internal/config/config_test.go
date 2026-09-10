package config

import (
	"testing"
)

func TestLoad_DefaultsToLoopback(t *testing.T) {
	mockEnv := map[string]string{}
	cfg, err := Load(func(k string) string { return mockEnv[k] })
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.BindAddress != "127.0.0.1" {
		t.Errorf("expected BindAddress to be 127.0.0.1, got %q", cfg.BindAddress)
	}
	if cfg.Port != 8080 {
		t.Errorf("expected Port to be 8080, got %d", cfg.Port)
	}
	if cfg.ListenAddr() != "127.0.0.1:8080" {
		t.Errorf("expected ListenAddr to be 127.0.0.1:8080, got %q", cfg.ListenAddr())
	}
	if cfg.DocsDBPath != "/app/packs/core/docs.db" {
		t.Errorf("expected DocsDBPath default, got %q", cfg.DocsDBPath)
	}
	if cfg.WebRoot != "/app/web" {
		t.Errorf("expected WebRoot default, got %q", cfg.WebRoot)
	}
}

func TestLoad_AllowsExplicitBindAddress(t *testing.T) {
	mockEnv := map[string]string{
		"TOOLBOX_BIND_ADDRESS": "0.0.0.0",
		"TOOLBOX_PORT":         "9090",
	}
	cfg, err := Load(func(k string) string { return mockEnv[k] })
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.BindAddress != "0.0.0.0" {
		t.Errorf("expected BindAddress to be 0.0.0.0, got %q", cfg.BindAddress)
	}
	if cfg.Port != 9090 {
		t.Errorf("expected Port to be 9090, got %d", cfg.Port)
	}
	if cfg.ListenAddr() != "0.0.0.0:9090" {
		t.Errorf("expected ListenAddr to be 0.0.0.0:9090, got %q", cfg.ListenAddr())
	}
}

func TestLoad_RejectsNonNumericPort(t *testing.T) {
	mockEnv := map[string]string{
		"TOOLBOX_PORT": "abc",
	}
	_, err := Load(func(k string) string { return mockEnv[k] })
	if err == nil {
		t.Fatal("expected error for non-numeric port, got nil")
	}
}

func TestLoad_RejectsOutOfRangePort(t *testing.T) {
	mockEnv := map[string]string{
		"TOOLBOX_PORT": "70000",
	}
	_, err := Load(func(k string) string { return mockEnv[k] })
	if err == nil {
		t.Fatal("expected error for port > 65535, got nil")
	}
}
