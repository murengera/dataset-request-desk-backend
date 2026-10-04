# Engineering Notes & Design Document

**Project:** Dataset Request Desk  
**Author:** Technical Assessment Submission  
**Stack:** Python 3.9+, Django 4.2, Django REST Framework, PostgreSQL 15, Docker  

---

## 1. Design & Architecture

### 1.1 Data Model & State Boundaries

```
[ User ] (Custom AbstractUser: client, operator, admin)
   │ 1
   │ 
   ├──< (owns) ─── [ Request ] (task_name, episodes_requested, deadline, status)
   │                  │ 1          │ 1
   │                  │            └──< [ RequestStatusHistory ] (audit log: who, when, old->new)
   │                  │ 1
   │                  └──< [ Assignment ] (OneToOne with Episode)
   │                               │ 1
   │                               │ 
   └───────────────────────────────┴─── [ Episode ] (episode_id, robot_id, task_name, recorded_at, quality)
```

- **Where State Lives:** State transitions for `Request` live strictly in a centralized domain service layer (`dataset_requests/services.py`). Neither the serializer nor the view set modifies state directly.
- **Relational Integrity:**
  - `Assignment.episode` is a `OneToOneField` to enforce the hard invariant that an episode can belong to at most one active request.
  - `RequestStatusHistory` captures an immutable audit log of every transition with foreign keys to `Request` and `User`.

### 1.2 The 2 Hardest Decisions & Why

1. **Centralized Domain Service vs Model Methods for Transitions:**
   - *Decision:* Implemented transitions and business rule validation in `dataset_requests/services.py` (`transition_request()`, `assign_episode()`) rather than bloated model `save()` hooks.
   - *Rationale:* Transitioning a request requires verifying multiple related entities (e.g. checking assigned episode count, inspecting role permissions, verifying target state, and creating audit log entries atomically). Placing this in a domain service ensures transactions (`transaction.atomic`) wrap all changes together and keeps models lightweight.

2. **App Naming & Python Namespace Collision:**
   - *Decision:* Named the Django application `dataset_requests` instead of `requests`.
   - *Rationale:* Standard Django scaffolding often suggests naming domain apps after the resource (`requests`). However, naming an app `requests` shadows the ubiquitous Python HTTP library `requests`, causing subtle circular import failures in DRF authentication and third-party tools. Naming it `dataset_requests` eliminates namespace collisions cleanly.

---

## 2. Deliberate Simplifications & Next Steps

### 2.1 What was deliberately left out or simplified:
- **Synchronous CSV Processing:** CSV parsing is handled synchronously within an atomic database transaction with batch inserts. For files up to ~50,000 rows, this executes in a few seconds.
- **Token Authentication:** Used DRF's built-in `TokenAuthentication` rather than asymmetric JWT / OAuth2 / SSO. For an internal tooling platform, token authentication is straightforward, secure over TLS, easily revocable, and has low operational complexity.
- **Lightweight Frontend:** Used a single-page HTML5/CSS3/JavaScript interface communicating directly with the REST API. This avoids complex Webpack/Node build steps while providing full interactive capabilities.

### 2.2 What I would do next with two more days:
1. **Asynchronous Background Processing (Celery / Redis):** Offload episode CSV uploads and large batch exports to Celery workers with real-time SSE (Server-Sent Events) progress updates.
2. **Bulk Assignment by Filter:** Allow operators to assign episodes in bulk with a single click (e.g. "Assign all matching good episodes up to requested count") rather than one-by-one.
3. **Advanced Soft Deletes & Archival:** Add soft-delete support for requests and episodes with automated retention policies.

---

## 3. Something That Went Wrong & How I Diagnosed It

**The Issue:**  
During initial setup of the API test suite, tests involving DRF views failed with cryptic `AttributeError` / import errors related to HTTP requests.

**Diagnosis & Resolution:**  
1. Inspected the traceback and noticed `import requests` in an external dependency was resolving to our local `requests/` directory rather than Python's standard `requests` package.
2. Verified using `python -c "import requests; print(requests.__file__)"` which printed the local app directory instead of `site-packages/requests`.
3. Renamed the app to `dataset_requests`, updated `INSTALLED_APPS`, `urls.py`, and migration references. Ran `python manage.py test` — all tests immediately resolved and passed.

---

## 4. Security Considerations

### 4.1 Implemented Controls
- **Password Hashing:** Utilizes Django's standard PBKDF2 with SHA-256 password hashing.
- **Server-Side Authorization:** Every endpoint enforces role checks (`client`, `operator`, `admin`) at the view/service layer. Clients can strictly only view and interact with their own requests (`get_queryset()` filtered by `client=request.user`).
- **Registration Privilege Separation:** The public registration endpoint (`POST /api/auth/register/`) forces the `client` role. `operator` and `admin` roles cannot be self-assigned.
- **SQL Injection Prevention:** All database operations and analytics use Django ORM parameterized queries with `TruncDate` and `Count` aggregations.

### 4.2 Top 2 Vulnerabilities to Worry About in this System
1. **Broken Object Level Authorization (BOLA / IDOR):**  
   If an endpoint relied solely on `Request.objects.get(pk=id)` without scoping to `request.user` for clients, a malicious client could view or accept/reject another client's robotics dataset. *Mitigated by strict role filtering in `RequestViewSet.get_queryset` and service-level checks.*
2. **Denial of Service via Unbounded File Uploads (CSV Bomb):**  
   An operator uploading a multi-gigabyte corrupted CSV could exhaust server memory if parsed in-memory. *Mitigated by reading line-by-line using Python `csv.DictReader` and setting max file size limits.*

---

## 5. Scaling Analysis (10× Users, 100× Episodes)

| Dimension | At 10× Users / 100× Episodes (~5M episodes) | Recommended Architecture Change |
|---|---|---|
| **Database Queries** | Sequential scans on `episodes` table slow down filtering by quality/robot. | 1. Add composite B-tree index on `(task_name, quality, recorded_at)`.<br>2. Add partial index on `(task_name) WHERE quality = 'good'` for top-5 analytics.<br>3. Partition `episodes` table by `recorded_at` (range partitioning by month). |
| **CSV Ingestion** | Uploading 500k episodes blocks the HTTP thread. | Move CSV ingestion to Celery background task using PostgreSQL `COPY FROM STDIN` (bulk binary copy). |
| **Read/Write Scaling** | Heavy analytics dashboard queries compete with operational writes. | Introduce a PostgreSQL Read Replica for analytics and dashboard reporting (`DATABASE_ROUTERS`). |
| **Caching** | Analytics date-range queries recomputed on every page reload. | Cache analytics query results in Redis with a 5-minute TTL (`django-redis`). |

## 6. AI Tooling Disclosure

- **Tools Used:** Antigravity AI assistant.
- **What it was used for:** Scaffolding boilerplate configurations (Docker multi-stage build, GitHub Actions workflow template, OpenAPI Swagger schema integration) and initial test case generation.
- **Review & Verification:** All domain logic (state transition rules, assignment validation, CSV normalization, role scoping, database queries) was verified and tested directly against project specifications.

---

## 7. End-to-End API Testing (Postman Test Suite)

To complement the automated Django test suite (26 unit/integration tests), an interactive **Postman Collection (`candidate-pack`)** was used for manual and automated API verification across all user roles (`client`, `operator`, `admin`).

```
candidate-pack (Postman API Collection)
 ├── Authentication & User Identity
 │    ├── POST  /api/auth/login/                             -> login
 │    ├── POST  /api/auth/register/                          -> register
 │    └── GET   /api/auth/me/                                -> Verify Logged-In
 ├── Client Workflow
 │    ├── POST  /api/requests/                               -> Client Creates a Dataset
 │    └── GET   /api/requests/                               -> Client Views Their Own Requests
 ├── Operator Workflow & Domain Invariants
 │    ├── POST  /api/auth/login/                             -> login as operator
 │    ├── GET   /api/episodes/                               -> Search & Filter Available Episodes
 │    ├── GET   /api/requests/                               -> View All Requests Across All Clients
 │    ├── POST  /api/requests/{id}/transition/               -> Move Request to in_progress
 │    ├── POST  /api/requests/{id}/transition/               -> Test Business Rule: Try Delivering BEFORE Assigning (Must Fail)
 │    ├── POST  /api/requests/{id}/assign_episode/           -> Assign Episodes to the Request
 │    └── GET   /api/analytics/                              -> View the Analytics Dashboard
 ├── Review & Rework Cycle
 │    ├── POST  /api/requests/{id}/transition/               -> reject a delivered request (with feedback notes)
 │    └── POST  /api/requests/{id}/transition/               -> restart work on the rejected request (rework flow)
 ├── Data Ingestion & Admin Operations
 │    ├── POST  /api/episodes/import_csv/                    -> Test CSV File Upload
 │    ├── POST  /api/auth/login/                             -> Login as Admin
 │    ├── GET   /api/users/                                  -> List All Users as Admin
 │    ├── POST  /api/users/                                  -> Create a New Operator User
 │    └── PATCH /api/users/{id}/                             -> Change User Role or Deactivate User
```

### Verified Scenarios & Assertions Matrix

| # | Request Name | Endpoint & Method | Role Tested | Verified Behavior & Assertions |
|---|---|---|---|---|
| **1** | `login` | `POST /api/auth/login/` | Client / Operator | Returns `200 OK` with auth token (`Token <key>`) and serialized user object. |
| **2** | `register` | `POST /api/auth/register/` | Anonymous | Enforces `client` role assignment on registration; returns `201 Created` with token. |
| **3** | `Verify Logged-In` | `GET /api/auth/me/` | Authenticated User | Returns `200 OK` confirming user role, email, and organisation. |
| **4** | `Client Creates a Dataset` | `POST /api/requests/` | Client | Creates request with status `submitted`; automatically normalizes empty string deadlines to `null`. |
| **5** | `Client Views Their Own Requests` | `GET /api/requests/` | Client | Verifies object-level authorization: client can strictly only view requests belonging to their account. |
| **6** | `Search & Filter Available Episodes` | `GET /api/episodes/` | Operator | Filters by `task_name` and `quality` (`good`, `usable`, `bad`); returns unassigned/assigned flags. |
| **7** | `View All Requests Across All Clients` | `GET /api/requests/` | Operator / Admin | Returns complete request desk across all clients with full `status_history` audit trail. |
| **8** | `Move Request to in_progress` | `POST /api/requests/{id}/transition/` | Operator | Transitions state from `submitted` to `in_progress`; appends entry to `status_history`. |
| **9** | `Try Delivering BEFORE Assigning` | `POST /api/requests/{id}/transition/` | Operator | **Domain invariant verification:** Attempting to transition to `delivered` when `assigned_count < requested` returns `400 Bad Request` (`"Cannot deliver request: assigned episodes (0) do not match requested count (10)"`). |
| **10** | `Assign Episodes to the Request` | `POST /api/requests/{id}/assign_episode/` | Operator | Assigns episode; enforces `OneToOne` invariant preventing assigning an already assigned episode. |
| **11** | `View the Analytics Dashboard` | `GET /api/analytics/` | Operator / Admin | Computes status counts, median delivery time (hours), top 5 tasks with good episodes, and daily robot recordings. |
| **12** | `reject a delivered request` | `POST /api/requests/{id}/transition/` | Client | Allows client to reject delivery with feedback notes (`[client (rejected)]: Reason...`), moving state to `rejected`. |
| **13** | `restart work on the rejected request` | `POST /api/requests/{id}/transition/` | Operator | Transitions state from `rejected` back to `in_progress` with operator rework notes. |
| **14** | `Test CSV File Upload` | `POST /api/episodes/import_csv/` | Operator | Multipart CSV upload; validates row normalization, idempotency, and skipping of malformed rows. |
| **15** | `List All Users as Admin` | `GET /api/users/` | Admin | Returns all user accounts; non-admins receive `403 Forbidden`. |
| **16** | `Change User Role or Deactivate User` | `PATCH /api/users/{id}/` | Admin | Allows updating user role (`client`/`operator`/`admin`) and toggling `is_active` status. |
