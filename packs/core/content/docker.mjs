/**
 * Docker reference. Original content authored for Developer Toolbox.
 */

export const source = {
  id: 'docker',
  name: 'Docker',
  url: 'https://docs.docker.com/',
  license: 'MIT',
  attribution:
    'Original reference content authored for Developer Toolbox. Links point to the Docker documentation; no documentation text is reproduced.',
};

export const documents = [
  {
    id: 'docker/dockerfile-layers',
    title: 'Dockerfile layers and build cache',
    url: 'https://docs.docker.com/build/cache/',
    tags: 'Dockerfile layer cache COPY RUN ADD invalidation build order bind mount cache mount',
    headings: ['Every instruction is a layer', 'Ordering for cache hits', 'COPY versus ADD', 'Cache mounts'],
    body: `
<h2>Every instruction is a layer</h2>
<p><code>RUN</code>, <code>COPY</code> and <code>ADD</code> each add a filesystem
layer. A layer records the difference from the one below, so a file deleted in a later
layer still occupies space in the image — and is still readable by anyone who pulls
it. Copying in a secret and deleting it in the next instruction does not remove it.</p>

<h2>Ordering for cache hits</h2>
<p>A layer is reused only if the instruction and all its inputs are unchanged, and a
miss invalidates everything after it. So put what changes least at the top:</p>
<pre><code>COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build</code></pre>
<p>Copying the manifests before the source means a code change does not reinstall
dependencies. <code>COPY . .</code> first is the single most common cause of slow
builds.</p>

<h2>COPY versus ADD</h2>
<p>Use <code>COPY</code>. <code>ADD</code> additionally fetches URLs and
auto-extracts archives — behaviour that is surprising, and a hazard when the source is
not fully trusted. If you want an archive extracted, extract it explicitly.</p>

<h2>Cache mounts</h2>
<p>With BuildKit, a cache mount keeps a package cache between builds without putting
it in a layer:</p>
<pre><code>RUN --mount=type=cache,target=/root/.cache/pnpm pnpm install</code></pre>
<p>Use <code>--mount=type=secret</code> for credentials a build needs: the value is
available during the instruction and never written to a layer, unlike a build
argument, which is recorded in the image history.</p>
`,
  },

  {
    id: 'docker/multi-stage-builds',
    title: 'Multi-stage builds and small images',
    url: 'https://docs.docker.com/build/building/multi-stage/',
    tags: 'multi-stage FROM AS COPY --from distroless scratch alpine static image size',
    headings: ['The pattern', 'Choosing a runtime base', 'What to copy', 'Measuring'],
    body: `
<h2>The pattern</h2>
<p>Build in one stage with the toolchain available, then copy only the artefact into a
clean final stage. The build stage and everything in it is discarded.</p>
<pre><code>FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /app/server ./cmd/server

FROM gcr.io/distroless/static:nonroot
COPY --from=build /app/server /server
USER nonroot:nonroot
ENTRYPOINT ["/server"]</code></pre>
<p><code>-ldflags="-s -w"</code> strips the symbol table and DWARF information, which
typically removes a quarter of a Go binary's size.</p>

<h2>Choosing a runtime base</h2>
<ul>
<li><strong>distroless</strong> — libc and certificates, nothing else. No shell, so
nothing to exec if the process is compromised, and nothing to patch. Debugging means
adding a <code>:debug</code> variant temporarily.</li>
<li><strong>alpine</strong> — a shell and a package manager in about 8 MB. Note it
uses musl rather than glibc, which occasionally matters for dynamically linked
binaries and DNS behaviour.</li>
<li><strong>scratch</strong> — genuinely empty. Works for a static binary, but you
must add CA certificates yourself or every TLS call fails.</li>
</ul>

<h2>What to copy</h2>
<p>Be explicit. Copying a build directory wholesale often drags in source maps, test
fixtures and caches. Source maps in particular publish your entire source and can
dominate image size — exclude them from a production build rather than from the
<code>COPY</code>.</p>

<h2>Measuring</h2>
<p><code>docker images</code> shows the total; <code>docker history &lt;image&gt;</code>
attributes it per layer, which is how you find the instruction responsible. Put a
size check in CI: an image budget only holds if something enforces it.</p>
`,
  },

  {
    id: 'docker/networking-and-ports',
    title: 'Port publishing and container networking',
    url: 'https://docs.docker.com/engine/network/',
    tags: 'publish -p EXPOSE bind address 0.0.0.0 127.0.0.1 host.docker.internal bridge network localhost',
    headings: ['EXPOSE does not publish', 'Bind address inside the container', 'Restricting exposure', 'Container to container', 'Reaching the host'],
    body: `
<h2>EXPOSE does not publish</h2>
<p><code>EXPOSE 8080</code> is documentation. It makes no port reachable. Publishing
happens at run time with <code>-p</code>, or in Compose with <code>ports</code>.</p>

<h2>Bind address inside the container</h2>
<p>This is the one that wastes afternoons. A container has its own network namespace,
so <code>127.0.0.1</code> <em>inside</em> the container is not the host's loopback. A
process bound to <code>127.0.0.1</code> inside a container is unreachable from the
host no matter what you publish, because the published port forwards to the
container's external interface and nothing is listening there.</p>
<p>Bind <code>0.0.0.0</code> inside the container, and control exposure with the port
mapping. The two are often confused because on a workstation, outside a container,
binding loopback is exactly the right default.</p>

<h2>Restricting exposure</h2>
<p><code>-p 8080:8080</code> publishes on <strong>every</strong> host interface,
including your LAN address. To keep it local:</p>
<pre><code>docker run -p 127.0.0.1:8080:8080 myimage</code></pre>
<p>Note also that published ports are inserted ahead of most host firewall rules, so
a <code>-p</code> without a bind address can be reachable even when you believe the
firewall blocks it.</p>

<h2>Container to container</h2>
<p>On a user-defined network, containers reach each other by service name — Docker
runs an embedded DNS resolver. They use the <em>container</em> port, not the published
one, so a service published as <code>8081:8080</code> is still <code>name:8080</code>
to its peers. The default bridge has no such name resolution, which is why Compose
creates a network per project.</p>

<h2>Reaching the host</h2>
<p><code>host.docker.internal</code> resolves to the host from inside a container on
Docker Desktop. On Linux it is not present by default; add
<code>--add-host=host.docker.internal:host-gateway</code>.</p>
`,
  },

  {
    id: 'docker/volumes-and-data',
    title: 'Volumes, bind mounts and data persistence',
    url: 'https://docs.docker.com/engine/storage/volumes/',
    tags: 'volume bind mount tmpfs persistence data anonymous named permissions read-only',
    headings: ['Three kinds of mount', 'Named volumes versus bind mounts', 'Permissions', 'Read-only and tmpfs'],
    body: `
<h2>Three kinds of mount</h2>
<ul>
<li><strong>Named volume</strong> — storage Docker manages.
<code>-v mydata:/var/lib/app</code>. Survives the container, portable between them,
and the right choice for real data.</li>
<li><strong>Bind mount</strong> — a host path.
<code>-v /home/me/src:/src</code>. Exactly the host's files, with the host's
permissions. Ideal for development, risky in production because the container's view
depends on the host's layout.</li>
<li><strong>tmpfs</strong> — memory only, gone when the container stops. For scratch
space and anything that must not reach disk.</li>
</ul>

<h2>Named volumes versus bind mounts</h2>
<p>A named volume is initialised from the image's contents at that path the first time
it is used; a bind mount is not — it shadows whatever the image had there. That is why
bind-mounting over a directory the image populated appears to delete it.</p>
<p>An anonymous volume (<code>-v /var/lib/app</code>, no name) is created fresh and
then orphaned when the container is removed. These accumulate;
<code>docker volume prune</code> collects them.</p>

<h2>Permissions</h2>
<p>A container running as a non-root user cannot write to a volume owned by root,
which is the usual cause of a permission error on first run. Options: set ownership in
the Dockerfile with <code>COPY --chown</code>, run an init step as root that
<code>chown</code>s the mount, or choose a uid that matches the host's.</p>
<p>Note that a distroless image has no shell, so there is no entrypoint script
available to fix ownership at start-up — the ownership has to be right in the image.</p>

<h2>Read-only and tmpfs</h2>
<p>Running <code>--read-only</code> with a <code>tmpfs</code> for the paths that must
be writable is a strong hardening measure: it means a compromise cannot persist
anything to the filesystem. Combined with <code>--cap-drop ALL</code> and a non-root
user, it removes most of what an attacker inside a container would reach for.</p>
`,
  },

  {
    id: 'docker/compose',
    title: 'Compose: services, profiles and depends_on',
    url: 'https://docs.docker.com/compose/',
    tags: 'compose service profile depends_on healthcheck env_file volumes networks override',
    headings: ['A service', 'depends_on and health', 'Profiles', 'Overrides and environment'],
    body: `
<h2>A service</h2>
<pre><code>services:
  app:
    build: .
    ports:
      - "127.0.0.1:8080:8080"
    environment:
      - APP_BIND=0.0.0.0
    volumes:
      - app-data:/var/lib/app
    restart: unless-stopped

volumes:
  app-data:</code></pre>
<p>Compose creates a network per project, so services reach each other by name.</p>

<h2>depends_on and health</h2>
<p>Plain <code>depends_on</code> only orders <em>start-up</em>. It does not wait for
readiness, so an application that connects to a database on boot will still fail. Wait
for health instead:</p>
<pre><code>  db:
    image: postgres:17
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      retries: 10
  app:
    depends_on:
      db:
        condition: service_healthy</code></pre>
<p>Even then, an application should retry its own connections — a dependency can
become unhealthy long after start-up.</p>

<h2>Profiles</h2>
<p>A service with <code>profiles</code> is not started unless its profile is
requested, which is how an optional subsystem stays out of the default path:</p>
<pre><code>  worker:
    profiles: [background]</code></pre>
<pre><code>docker compose up -d                        # app and db only
docker compose --profile background up -d   # adds worker</code></pre>

<h2>Overrides and environment</h2>
<p><code>compose.override.yaml</code> is merged automatically, which keeps local
development settings out of the committed file. Several files can be layered with
repeated <code>-f</code> flags, later ones winning.</p>
<p><code>env_file</code> supplies variables to the container;
<code>.env</code> supplies variables for interpolation in the Compose file itself.
Conflating them is common — a value in <code>.env</code> does not reach the container
unless the Compose file passes it through.</p>
`,
  },
];
