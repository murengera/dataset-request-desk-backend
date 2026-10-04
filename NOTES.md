# Engineering Notes & Design Document

**Project:** Dataset Request Desk  
**Stack:** Python 3.9+, Django 4.2, Django REST Framework, PostgreSQL 15, Angular, Docker Compose  

---

## 1. Design & Architecture

### 1.1 Data Model & State Boundaries

```
[ User ] (role: client, operator, admin)
   │ 
   ├── (owns) ──> [ Request ] (task_name, episodes_requested, deadline, status, notes)
   │                 │             │
   │                 │             └──> [ RequestStatusHistory ] (audit log: who, when, old->new)
   │                 │ 
   │                 └──> [ Assignment ] (OneToOne with Episode)
   │                             │
   └─────────────────────────────┴────> [ Episode ] (episode_id, robot_id, task_name, recorded_at, quality)
```

- **Where state transitions live:** All state transitions for `Request` live strictly in `backend/dataset_requests/services.py` (`transition_request_status`). Views and serializers do not mutate request state directly.
- **Relational integrity:**
  - `Assignment.episode` is defined as a `OneToOneField` to database-enforce the invariant that an episode cannot be assigned to more than one active request.
  - `RequestStatusHistory` provides an append-only audit trail capturing the timestamp, actor, and status delta on every transition.

### 1.2 The Hardest Decisions & Trade-offs

1. **Domain Service Layer vs Model Methods:**
   - *Decision:* Kept models as clean schema definitions and moved transition validation into a dedicated service layer (`services.py`).
   - *Reason:* Transitioning a request is an orchestration task: we must check role permissions, count assigned episodes, transition the status, append audit records, and record feedback notes inside a single `transaction.atomic()` block. Putting all this inside `Model.save()` makes models difficult to test and reason about.

2. **Django App Namespace Collision (`dataset_requests` vs `requests`):**
   - *Decision:* Named the Django application `dataset_requests` instead of `requests`.
   - *Reason:* Naming the app `requests` shadows Python's standard `requests` package in `sys.modules`, which breaks third-party libraries and authentication middleware that import `requests`.

3. **Pure Database Aggregations for Analytics:**
   - *Decision:* Used PostgreSQL ORM aggregations (`TruncDate`, `Count`, `Avg`, `Extract`) in `backend/dataset_requests/analytics.py` instead of Python-level loops.
   - *Reason:* Loading thousands of rows into Python memory to compute daily averages or top tasks causes high memory pressure and slow responses. The database query engine computes these in milliseconds using indexes.

---

## 2. Deliberate Simplifications & Next Steps

### 2.1 What I Simplified for the Assessment:
- **Synchronous CSV Ingestion:** CSV uploads are processed synchronously within a database transaction. For the sample dataset (hundreds of rows), it executes in <100ms. For 100k+ rows, a background worker is needed.
- **Token-based Authentication:** Used DRF's standard `TokenAuthentication`. For an internal desk tool, this is simple, secure over HTTPS, and avoids the complexity of JWT refresh token rotation.
- **Simple Angular Architecture:** Built standalone components with plain TypeScript services and standard `HttpClient`. Avoided NgRx / complex state management libraries to keep the frontend small, readable, and easy to maintain.

### 2.2 What I Would Do Next with 2 More Days:
1. **Background Tasks with Celery & Redis:** Move CSV parsing and large dataset exports to background worker queues with real-time SSE progress bars.
2. **Bulk Assignment by Filter:** Let operators click "Assign All Matching (Good Quality)" to assign batches of episodes in a single query rather than selecting one-by-one.
3. **Soft Deletes & Data Retention:** Add soft deletion for requests and audit log archiving.

---

## 3. What Went Wrong & How I Solved It

**Problem:**  
When initially running the test suite, DRF view tests failed with strange import errors and `AttributeError` when resolving HTTP requests.

**Investigation & Fix:**  
1. Traced the stack trace and noticed `import requests` in an external dependency was resolving to our local `requests/` directory rather than the installed Python library.
2. Checked with `python -c "import requests; print(requests.__file__)"` and confirmed it pointed to the local folder.
3. Renamed the app from `requests` to `dataset_requests`, updated `INSTALLED_APPS` and URL routes, and ran the tests. All 26 tests passed immediately.

---

## 4. Security Considerations

### 4.1 Implemented Controls
- **Server-side Authorization:** Authorization is strictly enforced on the server. Clients can only query their own requests via `get_queryset()` filtering (`client=request.user`), and cannot self-assign `operator` or `admin` roles during registration.
- **State Machine Guardrails:** Transitions are role-gated (only clients can accept/reject; only operators/admins can start work, assign, and deliver).
- **SQL Injection Prevention:** All queries and analytics use parameterized Django ORM expressions.

### 4.2 Two Biggest Vulnerabilities to Watch For
1. **Broken Object-Level Authorization (BOLA / IDOR):** If detail or transition endpoints lacked user scoping, a client could manipulate another client's request ID. This is mitigated by scoping `get_queryset` and verifying ownership in `services.py`.
2. **Unbounded File Uploads (Denial of Service):** Maliciously large or malformed CSV files could cause high memory consumption. This is handled by parsing lines with Python's streaming `csv.DictReader` and setting request body size limits.

---

## 5. Scaling to 10× Users & 100× Episodes (~5M Records)

| Area | Bottleneck at 5M Episodes | Solution |
|---|---|---|
| **Database Filtering** | Sequential scans when filtering by `(task_name, quality)` | Add composite B-tree index `(task_name, quality, recorded_at)` and partial index on `WHERE quality = 'good'`. |
| **CSV Ingestion** | Sync parsing blocks worker thread | Offload parsing to Celery workers using PostgreSQL `COPY` command for bulk ingestion. |
| **Analytics** | Aggregations compete with operational read/write traffic | Route analytics queries to a PostgreSQL Read Replica with Redis caching (5-minute TTL). |
| **Table Size** | Table bloat over time | Range-partition `episodes` table by month on `recorded_at`. |

---

## 6. Tooling Disclosure

- Used GitHub Copilot / LLM tools for boilerplate scaffolding (initial Docker Compose template, GitHub Actions syntax, and initial test stubs).
- All business logic, state transitions, validation rules, analytics SQL aggregations, and Angular UI components were manually implemented, tested, and verified.

---

## 7. Manual & Automated API Verification (Postman Suite)

In addition to the 26 automated unit/integration tests (`python manage.py test`), the API was manually verified end-to-end using a Postman collection (`candidate-pack`) covering the full lifecycle:

1. **Authentication:** Register client -> Login client -> Login operator -> Verify identity `/api/auth/me/`.
2. **Client Submission:** Client creates request -> Views only their own requests.
3. **Operator Assignment & Invariant Verification:**
   - Operator lists all requests across all clients.
   - Operator moves request to `in_progress`.
   - **Negative Test:** Attempting to `deliver` before assigning all requested episodes returns `400 Bad Request` with error message.
   - Operator assigns episodes with `OneToOne` unique assignment check.
   - Operator delivers request.
4. **Review & Rework Cycle:**
   - Client rejects delivery with feedback notes.
   - Operator inspects rejection notes and restarts work (`in_progress` with rework notes).
   - Operator replaces episodes and re-delivers.
   - Client accepts delivery.
5. **CSV Ingestion & Analytics:**
   - Upload CSV -> Verified idempotent re-import without duplicates and error reporting on bad rows.
   - Query `/api/requests/analytics/` -> Verified median delivery time, top tasks, and daily robot breakdown.
6. **Admin Management:**
   - Admin lists all users -> Changes user role -> Deactivates/activates user accounts.
