package main

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"strconv"
	"time"

	"developer-toolbox/internal/config"
)

// healthcheckSubcommand is the argument that turns the binary into a probe
// instead of a server.
const healthcheckSubcommand = "healthcheck"

// runHealthcheck probes the local server and returns a process exit code.
//
// The runtime image is distroless, so there is no shell, no curl and no wget to
// write a HEALTHCHECK against. Shipping one of those to get a health probe would
// mean giving up the distroless base and the attack surface reduction that comes
// with it. The binary already speaks HTTP, so it probes itself instead: the image
// keeps exactly one executable and still reports health to Docker, Compose and
// any orchestrator that reads a container's health status.
//
// It checks /readyz rather than /healthz. Liveness only says the process is up,
// which the orchestrator can already see; readiness says it can actually serve,
// which is what "healthy" is being asked to mean here.
func runHealthcheck(getenv func(string) string) int {
	if getenv == nil {
		getenv = os.Getenv
	}

	port := config.DefaultPort
	if raw := getenv("TOOLBOX_PORT"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 65535 {
			fmt.Fprintf(os.Stderr, "healthcheck: invalid TOOLBOX_PORT %q\n", raw)
			return 1
		}
		port = parsed
	}

	// Always dialled over loopback, never the configured bind address. In the
	// container that address is 0.0.0.0, which is not a destination, and the probe
	// runs inside the same network namespace as the server in every case.
	target := "http://" + net.JoinHostPort("127.0.0.1", strconv.Itoa(port)) + "/readyz"

	client := &http.Client{
		Timeout: 3 * time.Second,
		Transport: &http.Transport{
			// A probe makes one request and exits, so pooling a connection only
			// leaves a socket behind in TIME_WAIT on every interval.
			DisableKeepAlives: true,
		},
	}

	resp, err := client.Get(target)
	if err != nil {
		fmt.Fprintf(os.Stderr, "healthcheck: %v\n", err)
		return 1
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		fmt.Fprintf(os.Stderr, "healthcheck: %s returned %d\n", target, resp.StatusCode)
		return 1
	}
	return 0
}
