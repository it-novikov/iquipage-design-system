#!/usr/bin/env bash
# First start on the VPS, run from the deployment directory as root. Generates the database passwords once, writes the
# env files (mode 0600) and creates the three roles of operations.md: the migration owner and the LOGIN NOSUPERUSER
# NOBYPASSRLS runtime and worker roles. secrets/storage.env (S3) is written by the operator beforehand. Re-running keeps
# existing secrets and roles.
set -euo pipefail
cd "$(dirname "$0")"
: "${SPRINTIQUE_ORIGIN:?e.g. https://sprintique.iqui.page}"
: "${SPRINTIQUE_MAIL_FROM:?e.g. Sprintique <no-reply@iqui.page>}"
umask 077
mkdir -p secrets
test -s secrets/storage.env || { echo "secrets/storage.env is missing" >&2; exit 1; }

secret() { local file="secrets/$1.secret"; [ -s "$file" ] || openssl rand -hex 32 > "$file"; cat "$file"; }
admin=$(secret postgres) migrator=$(secret migrator) runtime=$(secret runtime) worker=$(secret worker)
url() { echo "postgresql://$1:$2@127.0.0.1:54330/sprintique"; }

printf 'POSTGRES_PASSWORD=%s\nPOSTGRES_DB=sprintique\n' "$admin" > secrets/postgres.env
cat > secrets/migrate.env <<EOF
SPRINTIQUE_MIGRATION_DATABASE_URL=$(url sprintique_migrator "$migrator")
SPRINTIQUE_DATABASE_RUNTIME_ROLE=sprintique_app
SPRINTIQUE_DATABASE_WORKER_ROLE=sprintique_worker
EOF
cat > secrets/api.env <<EOF
SPRINTIQUE_ENVIRONMENT=production
SPRINTIQUE_HOST=127.0.0.1
SPRINTIQUE_PORT=4311
SPRINTIQUE_PUBLIC_ORIGIN=$SPRINTIQUE_ORIGIN
SPRINTIQUE_TRUST_PROXY=1
SPRINTIQUE_DATABASE_URL=$(url sprintique_app "$runtime")
SPRINTIQUE_SMTP_HOST=127.0.0.1
SPRINTIQUE_SMTP_PORT=25
SPRINTIQUE_SMTP_SECURITY=none
SPRINTIQUE_MAIL_FROM=$SPRINTIQUE_MAIL_FROM
EOF
[ -f secrets/providers.env ] && cat secrets/providers.env >> secrets/api.env
printf 'SPRINTIQUE_ENVIRONMENT=production\nSPRINTIQUE_WORKER_DATABASE_URL=%s\n' "$(url sprintique_worker "$worker")" > secrets/worker.env

docker compose up -d --wait postgres
psql() { docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U postgres -d postgres -qtA "$@"; }
for pair in "sprintique_migrator:$migrator" "sprintique_app:$runtime" "sprintique_worker:$worker"; do
  role=${pair%%:*} password=${pair#*:}
  [ "$(psql -c "SELECT 1 FROM pg_roles WHERE rolname='$role'")" = 1 ] ||
    psql -c "CREATE ROLE $role LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '$password'"
done
psql -c "ALTER DATABASE sprintique OWNER TO sprintique_migrator"
echo "Database ready. Next: docker compose --profile migrate run --rm migrate && docker compose up -d api worker"
