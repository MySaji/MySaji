#!/bin/sh
set -eu
# Only runs on a NEW volume. Existing databases require reviewed migration.
# PostGIS image creates its extension in public; queries require extensions.
app_password=$(cat /run/secrets/app_db_password)
: "${app_password:?Application database password must not be empty}"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=app_password="$app_password" <<'SQL'
CREATE SCHEMA IF NOT EXISTS extensions;
-- Safe only during empty-volume initialization, before application objects exist.
DROP EXTENSION IF EXISTS postgis_topology;
DROP EXTENSION IF EXISTS postgis_tiger_geocoder;
DROP EXTENSION IF EXISTS postgis;
CREATE EXTENSION postgis WITH SCHEMA extensions;
CREATE ROLE saji_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE saji TO saji_app;
GRANT USAGE ON SCHEMA public, extensions TO saji_app;
ALTER DEFAULT PRIVILEGES FOR ROLE saji_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO saji_app;
ALTER DEFAULT PRIVILEGES FOR ROLE saji_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO saji_app;
SQL
