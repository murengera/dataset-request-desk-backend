# Dataset Request Desk

An internal operations and client platform for a robotics data collection company to manage, assign, track, and fulfil robot teleoperation dataset requests.

---

## 1. Quickstart (One-Command Startup)

The entire application (PostgreSQL 15 database, Django migrations, seed data, episode CSV import, structured logging, Swagger docs, and modern web UI) can be started with Docker Compose:

```bash
docker compose up --build
```

Once running:
- **Web Application UI:** [http://localhost:8000/](http://localhost:8000/)
- **Interactive Swagger Docs (OpenAPI 3):** [http://localhost:8000/api/docs/](http://localhost:8000/api/docs/)
- **Redoc Documentation:** [http://localhost:8000/api/redoc/](http://localhost:8000/api/redoc/)
- **Health Check Endpoint:** [http://localhost:8000/api/health/](http://localhost:8000/api/health/)

---

## 2. Seed User Accounts & Credentials

The database automatically seeds 5 user accounts from `seed/users.json` on startup:

| Username | Role | Password | Description |
|---|---|---|---|
| `devon` | **admin** | `devon1234` | Full access, user management, operator capabilities |
| `sam` | **operator** | `sam1234` | Workflow transitions, episode assignments, CSV imports, analytics |
| `taylor` | **operator** | `taylor1234` | Operations team member |
| `alex` | **client** | `alex1234` | Client at Acme Robotics (can submit requests & accept/reject deliveries) |
| `jordan` | **client** | `jordan1234` | Client at Boston AI (can submit requests & accept/reject deliveries) |

> **Note:** Clients can also self-register at `POST /api/auth/register/` or via the web UI.

---

## 3. Running Automated Tests

Run the full automated test suite (26 tests covering auth, workflow invariants, role permissions, assignments, analytics, and CSV import idempotency):

```bash
# Using local virtualenv:
cd backend
python manage.py test

# Or inside Docker:
docker compose exec web python manage.py test
```

---

## 4. Local Development Setup (Without Docker)

If you prefer running without Docker:

```bash
# 1. Backend setup
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 2. Database migrations and seed data
python manage.py migrate
python manage.py seed_users
python manage.py import_episodes seed/episodes.csv

# 3. Start backend API server (runs on http://localhost:8000/)
python manage.py runserver

# 4. Frontend Angular setup (in a separate terminal)
cd frontend
npm install
npm start # runs on http://localhost:4200/
```

---

## 5. System Architecture & Tech Stack

- **Backend:** Python 3.9+, Django 4.2, Django REST Framework 3.16
- **Database:** PostgreSQL 15 (with relational integrity, unique constraints, and B-tree indexing)
- **Authentication:** Token-based Authentication (`Token <token>`) with server-side role enforcement (`client`, `operator`, `admin`)
- **Frontend:** Lightweight Vanilla HTML5/CSS3/JavaScript SPA served at `/` with instant role switching, interactive workflow actions, episode assignment drawer, CSV upload, and real-time analytics graphs.
- **API Documentation:** `drf-spectacular` generating OpenAPI 3.0 schemas with Swagger UI.
- **Observability:** Custom `StructuredLoggingMiddleware` outputting JSON access logs (method, path, status, duration_ms, user_id) and `/api/health/`.
- **CI/CD:** GitHub Actions workflow with automated ephemeral PostgreSQL database, Django system checks, migrations, test suite execution, Docker container build, and Docker Hub registry publish.

---

## 6. Core REST API Endpoints

| Method | Endpoint | Allowed Roles | Description |
|---|---|---|---|
| `POST` | `/api/auth/register/` | Public | Register new Client user |
| `POST` | `/api/auth/login/` | Public | Authenticate and obtain Token |
| `GET` | `/api/auth/me/` | Authenticated | Get current user profile and role |
| `GET` | `/api/requests/` | Client, Operator, Admin | List requests (scoped to user's role) |
| `POST` | `/api/requests/` | Client, Admin | Create new dataset request |
| `GET` | `/api/requests/{id}/` | Owner Client, Operator, Admin | Retrieve request details & assigned episodes |
| `POST` | `/api/requests/{id}/transition/` | Valid Role per state | Move request workflow state (`in_progress`, `delivered`, `accepted`, `rejected`) |
| `POST` | `/api/requests/{id}/assign/` | Operator, Admin | Assign episode to request |
| `POST` | `/api/requests/{id}/unassign/` | Operator, Admin | Unassign episode from request |
| `GET` | `/api/requests/analytics/` | Operator, Admin | Aggregated database metrics for date range |
| `GET` | `/api/episodes/` | Operator, Admin | List episodes with search & quality filter |
| `POST` | `/api/episodes/import_csv/` | Operator, Admin | Upload & idempotently import episode CSV |
| `GET` | `/api/health/` | Public | Health check with database ping |

---

## 7. Scaling Analytics to 5 Million Episodes

The `/api/requests/analytics/` endpoint executes **pure database-level aggregations** without pulling records into Python memory:

1. **Daily Episodes per Robot:**
   ```python
   Episode.objects.annotate(date=TruncDate('recorded_at')).values('date', 'robot_id').annotate(count=Count('id'))
   ```
   - **At 5M scale:** Backed by composite B-tree index `episodes_episode_rec_date_idx` on `(recorded_at, robot_id)`. For high write volumes, PostgreSQL range partitioning by month on `recorded_at` enables partition pruning.

2. **Top 5 Tasks by Good Quality Episodes:**
   ```python
   Episode.objects.filter(quality='good').values('task_name').annotate(count=Count('id')).order_by('-count')[:5]
   ```
   - **At 5M scale:** Backed by a partial index `CREATE INDEX idx_good_episodes ON episodes_episode (task_name) WHERE quality = 'good';`. This indexes only good episodes (~40-60% of table), enabling high-speed index scans.

3. **Request Fulfilment & Median Delivery Duration:**
   ```sql
   PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (delivered_at - submitted_at)))
   ```
   - Calculated via window functions / PostgreSQL percentile aggregates directly on status history audit timestamps.
