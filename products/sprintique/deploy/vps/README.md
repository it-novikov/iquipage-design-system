# Sprintique on one VPS

The production layout for a single Ubuntu host that already runs nginx and certbot: PostgreSQL in a container,
the API and the worker from the Jib image on the host network, TLS in nginx, sign-in codes through a loopback-only
Postfix that signs with DKIM, files in an external S3 bucket under a prefix. Runtime settings are those of
[operations.md](../../docs/operations.md); this folder only fixes how they are laid out on the host.

| Piece | Where |
| --- | --- |
| Deployment directory | `/opt/sprintique-vnext` (mode 0700): `compose.yml`, `bootstrap.sh`, `.env` with `SPRINTIQUE_IMAGE` |
| Secrets | `/opt/sprintique-vnext/secrets/*.env`, `*.secret` (0600), never in git |
| PostgreSQL | container `sprintique-vnext-postgres-1`, `127.0.0.1:54330`, volume `sprintique-vnext_postgres-data` |
| API | `127.0.0.1:4311`, behind nginx (`nginx.conf` → `/etc/nginx/sites-enabled/sprintique.conf`) |
| Public API and MCP | `api.iqui.page` → the same process (second server of `nginx.conf`: only `/api/`, `/mcp`, `/.well-known/oauth-*`, with `Host $host`); `SPRINTIQUE_API_ORIGIN=https://api.iqui.page` in `secrets/api.env` |
| Mail | Postfix `127.0.0.1:25` (`inet_interfaces = loopback-only`), OpenDKIM `127.0.0.1:8891`, selector `sprintique` |
| Files | S3 bucket, `SPRINTIQUE_STORAGE_PREFIX=vnext/` |

## First start

1. Write `secrets/storage.env` with the `SPRINTIQUE_STORAGE_*` settings (endpoint, region, bucket, prefix, keys).
   Google and Apple sign-in, when configured, go to `secrets/providers.env` (see operations.md) and the Apple key file
   is mounted read-only.
2. `SPRINTIQUE_ORIGIN=https://<domain> SPRINTIQUE_MAIL_FROM='Sprintique <no-reply@<domain>>' ./bootstrap.sh` —
   generates the database passwords once, writes the env files, starts PostgreSQL and creates the three roles.
3. Load the image and deploy (below), then install `nginx.conf`, `nginx -t`, `systemctl reload nginx`.

## Deploying a release

```sh
npm run build && (cd server && ./gradlew jibBuildTar -Pimage.architecture=amd64)   # on the build machine
rsync --partial server/build/jib-image.tar root@<host>:/opt/sprintique-vnext/images/sprintique-server-<commit>.tar
docker load -i images/sprintique-server-<commit>.tar && docker tag sprintique-server:<version> sprintique-server:<commit>
sed -i 's/^SPRINTIQUE_IMAGE=.*/SPRINTIQUE_IMAGE=sprintique-server:<commit>/' .env
docker compose --profile migrate run --rm migrate && docker compose up -d api worker
curl -fsS http://127.0.0.1:4311/ready
```

Take a backup before a release that adds migrations. Rolling back to an older image works only while its migration
ledger is still a prefix of the applied one; otherwise restore the backup.

## Backups

`/etc/cron.d/sprintique-vnext-backup` dumps the application database daily at 03:30 UTC (custom format, from the
container) into `/root/backups/sprintique-vnext/` and keeps 14 days:

```sh
docker compose exec -T postgres pg_dump -U postgres -Fc sprintique > /root/backups/sprintique-vnext/sprintique-<time>.dump
```

The dumps stay on the same host and are not encrypted; copy them off the host for disaster recovery. Objects stay in
the S3 bucket; its own versioning or replication is configured with the provider.

## Mail

Codes are delivered straight from the host, so the sending domain needs, in DNS: SPF `v=spf1 ip4:<host ip> ~all`,
the DKIM key `sprintique._domainkey` (public part in `/etc/opendkim/keys/<domain>/sprintique.txt`), DMARC
`_dmarc` `v=DMARC1; p=quarantine`, and a PTR record of the host address pointing at the domain (set with the hosting
provider). Without them letters land in spam or are refused.
