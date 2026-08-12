#!/bin/sh
set -eu

DATABASE_PASSWORD="$(cat /run/secrets/database_password)"
export DATABASE_PASSWORD

if [ "${#DATABASE_PASSWORD}" -lt 32 ] || [ "${#DATABASE_PASSWORD}" -gt 512 ]; then
  echo "The application database password must contain 32 to 512 characters." >&2
  exit 1
fi

case "${DATABASE_PASSWORD}" in
  *[![:graph:]]*)
    echo "The application database password must use visible non-whitespace characters only." >&2
    exit 1
    ;;
esac

psql --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" <<'EOSQL'
\set ON_ERROR_STOP on
\getenv application_password DATABASE_PASSWORD

CREATE ROLE open_channel_hub
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION
  NOBYPASSRLS
  PASSWORD :'application_password';

ALTER DATABASE open_channel_hub OWNER TO open_channel_hub;
REVOKE ALL ON DATABASE open_channel_hub FROM PUBLIC;
GRANT CONNECT ON DATABASE open_channel_hub TO open_channel_hub;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
EOSQL

unset DATABASE_PASSWORD
