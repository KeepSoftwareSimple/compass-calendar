# Setup Compass on a server

This guide explains how to setup Compass on your own infrastructure.

If you'd rather have a local development setup or use the binaries, see [Local Development](../development/local-development.md).

## Before you start

### Overview

- OS: Ubuntu
- Platform: Docker
- Reverse-proxy: Caddy
- Frontend: `https://compass.example.com`
- API: `https://compass.example.com/api`

### Disclaimers

This doc assumes you're comfortable with:

- SSH
- DNS records (pointing a domain at a server's IP)
- Installing Docker on Ubuntu. It'll probably work with other Debian-based distros, but we only test it on Ubuntu
- Editing files on a remote machine

### Domain disclaimers

- Whenever you see `compass.example.com`, replace with your domain.
- A separate API domain like `https://api.compass.example.com` may be possible, but it adds cookie and CORS complexity. This guide uses one domain for the first server install.

Plan for **15 to 45 minutes** from start to finish.

### High-level steps

1. Get a VPS with Ubuntu, then install Docker, Docker Compose, and Caddy.
2. Point DNS at the server and confirm the server has Docker, Compose, Caddy, and open `80`/`443`.
3. SSH into the server and install Compass with the self-host installer.
4. Configure Caddy to proxy `compass.example.com` to `127.0.0.1:9080` and `/api/*` to `127.0.0.1:3000`.
5. Verify Caddy can reach the local backend over HTTPS.
6. Edit `~/compass/compass.yaml` to use your public URLs, then restart Compass.
7. Sign in over HTTPS and run the basic tests below.

## Setup your VPS

If you already have an Ubuntu VPS with Docker, Docker Compose, and Caddy installed, [skip to the next step](#configure-dns).

### Pick a provider

Any provider will do, but here are two simple options.

**[DigitalOcean Droplets](https://docs.digitalocean.com/products/droplets/getting-started/).** Their [Initial Server Setup with Ubuntu](https://www.digitalocean.com/community/tutorials/initial-server-setup-with-ubuntu) guide walks you through region, size, SSH key upload, and firewall setup. A Droplet at $12/month (1 vCPU, 2 GB RAM) is enough for a personal Compass instance.

**[Hetzner Cloud](https://docs.hetzner.com/cloud/servers/getting-started/creating-a-server/)** is a strong low-cost alternative. Their CX22 starts at around $4/month for 2 vCPU and 2 GB RAM.

### Minimum specs

| Resource | Minimum |
| --- | --- |
| RAM | 2 GB (4 GB recommended) |
| Storage | 20 GB SSD |
| OS | Ubuntu 22.04 LTS or 24.04 LTS |
| Network | 1 static public IPv4 address |

### Initial server setup

After the server is created, SSH in and run your provider's initial setup steps (create a non-root sudo user, etc.), then open the ports Caddy needs:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Then install Docker Engine, Docker Compose, and Caddy using the official apt packages:

- [Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [Caddy on Ubuntu](https://caddyserver.com/docs/install#debian-ubuntu-raspbian)

## Configure DNS

### Get a domain name

You'll need a domain name to get HTTPS working. If you already have one (me.dev) and are OK with adding a subdomain (calendar.me.dev), you can skip this step.

Two good options for new domains:

**[Namecheap](https://www.namecheap.com)** — straightforward, `.com` domains ~$9–11/year, free WHOIS privacy included.

**[Cloudflare Registrar](https://www.cloudflare.com/products/registrar/)** — domains at cost. A good choice if you want fast DNS management in one place.

### Create a DNS record for the subdomain you want to use

```text
Type: A
Name: <subdomain>       # example: 'cal', 'calendar', 'compass', 'app'
Value: <your-vps-ipv4-address>
```

That makes the subdomain point at the server's public IPv4 address. DNS is managed wherever your domain's nameservers point. That may be
your registrar, but it may also be another host such as Cloudflare or Vercel.

Say you have a domain `example.com` and create the A record for the subdomain `compass`. You can confirm the record from your own computer:

```bash
dig +short A compass.example.com
```

It should print your VPS IPv4 address. It might take a few minutes for your DNS record to propagate.

### Confirm firewall & Docker

On the server, confirm the basic tools and ports:

```bash
lsb_release -a
docker --version
docker compose version
caddy version
sudo systemctl status caddy --no-pager
sudo ss -tulpn | grep -E ':(80|443|3000|9080)\b' || true
sudo ufw status verbose || true
```

If the server has been used for other projects, existing web servers, private-network tools,
or firewall rules can block Caddy even when the Compass containers are healthy.

For the recommended setup:

- Caddy should run as a system service.
- Public ports `80` and `443` should be available for Caddy.
- Ports `3000` and `9080` should be unused before the Compass installer runs.
- If UFW or another firewall is enabled, allow inbound TCP `80` and `443`.

Caddy needs port `80` for the first certificate setup and HTTP-to-HTTPS
redirects. It needs port `443` for the final HTTPS site.

## Install Compass on the server

### The fast way

We made a bash script that installs Compass. It's designed for convenience, so it handles things like generating valid secrets and populating the compose file.

```bash
curl -fsSL https://raw.githubusercontent.com/SwitchbackTech/compass/main/self-host/install.sh | sh
```

### The manual way

If you'd rather do everything yourself, check-out our [manual install guide](https://raw.githubusercontent.com/SwitchbackTech/compass/main/self-host/install-manual.sh), which has bash commands you can individually copy-paste. This'll give you full visibility and control, but will take longer.

## Configure reverse proxy with Caddy

Now that we have Docker, Caddy, and Compass install, we can wire up the proxy to ensure requests flow through your system smoothly.

Edit the Caddyfile, replacing `compass.example.com` with your domain.

```bash
sudo vi /etc/caddy/Caddyfile
```

```caddyfile
# Caddyfile
# https://caddyserver.com/docs/caddyfile-tutorial

compass.example.com {  # <- this is the only line you need to change
 handle /api/* {
  reverse_proxy 127.0.0.1:3000
 }

 # Sync public surface (OAuth callback + Google push). The `sync` container
 # runs by default, so this block is required — omitting it breaks Google
 # Calendar connect AND silently kills real-time sync. Keep it above the
 # catch-all `handle` below, and proxy only `/sync/*`: the Sync service's
 # private `/internal/*` routes share port 3010 and must never be exposed.
 handle /sync/* {
  reverse_proxy 127.0.0.1:3010
 }

 handle {
  reverse_proxy 127.0.0.1:9080
 }

 # Compress text responses. Stock Caddy ships gzip and zstd only; do not add
 # `br` here, it fails `caddy validate` without a brotli plugin. Brotli still
 # reaches browsers, see below.
 encode zstd gzip
}
```

This tells Caddy to serve your public domain over HTTPS, send `/api/*` requests
to the Compass backend on `127.0.0.1:3000`, send `/sync/*` to the Sync service
on `127.0.0.1:3010` (Google OAuth redirect `/sync/google` and push notifications),
and send everything else to the web app on `127.0.0.1:9080`. `encode` at
site-block scope gzip/zstd-compresses text responses from every route,
including `/index.js` and each `chunk-*.js`. Its default content-type matcher
already covers HTML, CSS, JavaScript, JSON, SVG, and WASM, and it flushes as
the backend flushes, so `/api/events/stream` (server-sent events) keeps
streaming through it.

Brotli comes from the web container, not from Caddy: `bun run build.ts` writes
`.br` and `.gz` siblings next to every compressible build output, and
`self-host/serve-web.ts` answers a browser's `Accept-Encoding: br` with the
`.br` file and `Content-Encoding: br`. Caddy forwards `Accept-Encoding`
upstream and leaves responses that already carry `Content-Encoding` alone, so
a browser gets brotli end to end while Caddy's own `encode` only touches what
the app did not precompress. If you run `serve-web.ts` with no reverse proxy
at all (uncommon), the same negotiation applies and no `encode` is needed.

> **Editing this file later?** Edit the live `/etc/caddy/Caddyfile`, never a
> backup copy. Compass's own production host lost the `/sync/*` block for nine
> days in August 2026 because an unrelated edit was made against a stale backup.
> Nothing looked wrong: containers stayed healthy, the API answered, and the web
> app served `/sync/notifications/google` with a `200`, so Google treated every
> push notification as delivered and never retried. Calendar changes still
> arrived, just via the slow reconcile sweep instead of within seconds, and no
> new calendar could be connected at all. The `sync-webhook-route` deploy health
> check exists to catch exactly this.

Save the file and validate your changes:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
```

If validation passes, reload:

```bash
sudo systemctl reload caddy
```

If this is the first real HTTPS site on the server, Caddy will fetch a
certificate after the reload. That can take a few seconds.

## Verify you can reach the API

```bash
curl -f https://compass.example.com/api/health
```

A healthy backend returns JSON with `"status":"ok"`.

### Troubleshooting

If the healthcheck fails, Caddy isn't routing to the backend yet. Fix that before moving on. Here are some ideas.

If `curl` cannot connect to port `443`, check that Caddy is listening there:

```bash
sudo ss -tulpn | grep -E ':(80|443)\b' || true
sudo systemctl status caddy --no-pager -l
sudo journalctl -u caddy --since '10 minutes ago' --no-pager -l
```

If another process already owns `443`, Caddy cannot serve HTTPS. Common examples
are another web server, an old Caddy process, or a private-network HTTPS feature
such as Tailscale Serve. Stop or move the conflicting service, then restart
Caddy:

```bash
sudo systemctl reset-failed caddy
sudo systemctl restart caddy
```

## Switch Compass to your public URLs

> **Warning.** The default compose file keeps MongoDB, SuperTokens, and Postgres off the public internet. You should probably keep it that way. Don't add public port mappings for those services, don't open their ports in your firewall, and don't move them to public database hosts unless you know how you want to secure them. For this guide, only Caddy should be public, and Caddy should proxy only the web app and `/api`.

> **Warning.** Don't change `backend.apiUrl` until the reverse proxy works. The browser uses
> `backend.apiUrl` for API requests. If it points at an HTTPS URL Caddy can't
> serve yet, the app can load but cannot reach the backend.

Edit the config file:

```bash
cd ~/compass
vi compass.yaml
```

Set:

```yaml
web:
  url: https://compass.example.com
backend:
  apiUrl: https://compass.example.com/api
  originsAllowed:
    - https://compass.example.com
sync:
  callbackBaseUrl: https://compass.example.com
  credentialEncryptionKey: <32-byte-base64>
```

`sync.callbackBaseUrl` is what makes Google Calendar and Microsoft Outlook connect and push notifications work. It defaults to `http://localhost:3010` (installer default, fine for local-only setups), which external providers can never reach. Skip this if you do not plan to connect a calendar host.

`sync.credentialEncryptionKey` encrypts OAuth refresh tokens and Apple app-specific passwords at rest. The self-host installer generates it on a fresh install. For key rotation procedure, see [CLI key rotation](../development/cli.md#key-rotation-procedure-only).

### Apply config changes

Compass reads `compass.yaml` at startup via a Docker volume mount, so a restart picks up the new values:

```bash
cd ~/compass
./compass restart   
```

> `compass` is our minimal Bash CLI
>
> For more info, run `cd ~/compass && ./compass --help`

## Confirm it works

### Confirm API health

Confirm the public health check still works after applying the config changes:

```bash
curl -f https://compass.example.com/api/health
```

Then tail the backend logs while you open Compass in a browser. This lets you
see successful requests and spot backend errors immediately:

```bash
cd ~/compass
./compass logs backend
```

Health-check requests (`GET /api/health`) fire every few seconds and are hidden
from the tail by default so they don't drown out real traffic. To see them,
raise the log level to `debug` — either set `runtime.logLevel: debug` in
`compass.yaml`, or start the backend with `LOG_LEVEL=debug`:

```bash
cd ~/compass
LOG_LEVEL=debug docker compose up -d backend
./compass logs backend
```

For a final server-side check, run:

```bash
cd ~/compass
./compass status
sudo ss -tulpn | grep -E ':(80|443|3000|9080)\b' || true
curl -f https://compass.example.com/api/health
```

## Confirm UI access

Open `https://compass.example.com` in a browser. Run the password-only path first, before adding Google:

1. Create an account with email and password
2. Sign out
3. Sign back in
4. Create an event
5. Edit the event
6. Delete the event
7. `./compass restart`
8. Sign in again and confirm the events are still there

## What's next

### Backups

We leave backups and restore up to you, but we have a simple [Backups and restore guide](./backup-and-restore.md) that attempts to make that a little easier.

### Customizing

If you want to make custom changes to Compass, see the [custom code guide](./customizing.md)

### Connect your Google Calendar

You don't need to use Google or Google Calendar to use Compass. However, it can be nice to see your Gcal events in Compass and to sync changes. This requires some extra setup, through. See [the Google Calendar guide](./google-calendar.md) when you're ready to do some more config.

----

Have an idea on how this guide can be improved? Let us know in [this GitHub Discussion](https://github.com/SwitchbackTech/compass/discussions/1694).
