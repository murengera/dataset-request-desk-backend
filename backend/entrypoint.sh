#!/bin/sh
set -e

echo "Waiting for PostgreSQL database at $DB_HOST:$DB_PORT..."

# Wait until postgres is accepting connections
while ! python -c "
import psycopg2, os
try:
    conn = psycopg2.connect(
        dbname=os.environ.get('DB_NAME', 'dataset_request_desk'),
        user=os.environ.get('DB_USER', 'postgres'),
        password=os.environ.get('DB_PASSWORD', 'postgres'),
        host=os.environ.get('DB_HOST', 'db'),
        port=os.environ.get('DB_PORT', '5432')
    )
    conn.close()
    exit(0)
except Exception:
    exit(1)
" 2>/dev/null; do
  sleep 1
done

echo "PostgreSQL is up and ready!"

echo "Applying database migrations..."
python manage.py migrate --noinput

echo "Seeding initial users from seed/users.json..."
python manage.py seed_users

echo "Importing initial episodes from seed/episodes.csv..."
python manage.py import_episodes

echo "Starting application server..."
exec "$@"
