# Submission Notes

## Live demo

**https://YOUR-SERVICE.onrender.com** · deployed on Render using [`render.yaml`](./render.yaml)

```bash
BASE=https://YOUR-SERVICE.onrender.com
curl $BASE/health
curl -X POST $BASE/tasks -H "Content-Type: application/json" -d '{"title":"Try it","priority":"high"}'
curl -X PATCH $BASE/tasks/<id>/assign -H "Content-Type: application/json" -d '{"assignee":"Alice"}'
curl "$BASE/tasks?page=1&limit=10"
```

> This runs on Render's free plan. It goes to sleep when idle, so the first request can take about 50 seconds. Tasks are stored in memory, so they reset whenever the service restarts. The build runs `npm test`, so a failing test stops a deploy.

## What's included

| Deliverable | Where |
|---|---|
| Unit tests: service and validators | `task-api/tests/taskService.test.js`, `task-api/tests/validators.test.js` |
| Integration tests: all routes (Supertest) | `task-api/tests/tasks.routes.test.js` |
| Tests for the new endpoint | `task-api/tests/assign.test.js` |
| Bug report (8 bugs + minor notes) | [`BUG_REPORT.md`](./BUG_REPORT.md) |
| Fixes (bugs #1–#4) | `task-api/src/services/taskService.js` |
| New endpoint `PATCH /tasks/:id/assign` | `routes/tasks.js`, `services/taskService.js`, `utils/validators.js` |

Commits are in the order the work was done: **tests → fixes → feature → docs**. Each bug was caught by a test before it was fixed.

## Coverage (`npm run coverage`)

```
-----------------|---------|----------|---------|---------|-------------------
File             | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-----------------|---------|----------|---------|---------|-------------------
All files        |   98.79 |    96.77 |   96.77 |   98.67 |
 app.js          |   84.61 |       75 |      50 |   84.61 | 17-18
 tasks.js        |     100 |    96.15 |     100 |     100 | 21
 taskService.js  |     100 |    94.73 |     100 |     100 | 22
 validators.js   |     100 |      100 |     100 |     100 |
-----------------|---------|----------|---------|---------|-------------------
Tests: 81 passed, 81 total
```

The only uncovered lines in `app.js` are the `app.listen` block, which runs only when the file is started directly (`npm start`). The tests import `app` without starting a server.

## How the tests are organised

- **Unit tests** call `taskService` and the validators directly, to test the business rules on their own.
- **Integration tests** go through Supertest to check HTTP behaviour: status codes, response bodies, and the order routes are matched in (for example, that `/stats` isn't treated as an `/:id`).
- `beforeEach` calls `taskService._reset()` so each test starts with an empty store.
- Tests check what callers can observe (responses and stored state), not internal details.
- Known-but-unfixed bugs are written as `test.failing`. Each one describes the correct behaviour, so the suite stays green, and Jest will report it once someone fixes the bug.

## Feature: `PATCH /tasks/:id/assign` — design decisions

```
PATCH /tasks/:id/assign
Body: { "assignee": "Alice" }   → 200, the updated task
Body: { "assignee": null }      → 200, the task is now unassigned
```

- **Validation:** `assignee` must be a string that isn't empty after trimming, with at most 100 characters. The name is stored trimmed. An empty string, a whitespace-only string, a number, an object, or a missing key returns **400**. I chose to reject `""` instead of treating it as "unassign", because an empty string is more likely a bug in the client (such as an empty form field) than a deliberate action.
- **Unassigning:** use an explicit `null`. The `assignee` key has to be present, so an accidentally empty body `{}` gets a 400 instead of silently removing the assignee.
- **Already assigned:** reassignment is allowed and replaces the previous name. Assigning the same name again returns 200 and changes nothing (idempotent). I didn't return 409 Conflict because handing a task to someone else is a normal action. If the business wants to prevent silent takeovers, the next step would be a 409 unless the client sends `force: true` or an `If-Match` version header.
- **Completed tasks** can still be assigned, for example to record who did the work.
- **Order of checks:** validation runs first (400), then the task lookup (404). This matches the existing `PUT` route.
- **Data shape:** new tasks now include `assignee: null`, so the field is always present and clients don't have to tell "missing" apart from "unassigned".
- **Single write path:** `PUT` can't set `assignee` because of the allowlist added in fix #4. The only way to change the assignee is through this endpoint, which validates it.
- **Deliberately not done:** checking the name against a real user list. There's no users table yet, so a free-text name is what the brief asks for. In production I'd store a user ID instead.

## What I'd test next with more time

- Fix bugs #5–#7 and change their `test.failing` tests to normal `test`s.
- Query-parameter edge cases: negative, zero, non-numeric or very large `page`/`limit`, and combining `status` with pagination.
- `/stats` with a frozen clock (`jest.useFakeTimers().setSystemTime`), to test the boundary where a task becomes overdue.
- Property-based tests (fast-check) that fire random request bodies at the validators.
- Contract tests generated from an OpenAPI spec, so the docs and the code can't disagree again (see bug #8).

## What surprised me

- `String.prototype.includes` used for an equality check (bug #2). It looks right when you skim it, and it only goes wrong for particular inputs.
- `completeTask` resetting priority to `medium` (bug #3). It looks like leftover debug or copy-paste code, since nothing else suggests completion should change priority.
- The README and the code use different status names (bug #8).
- Several bugs combine: the truthiness checks in the validators (bug #5) let `null` into the store, and the `includes` call then turned that into a 500 on an unrelated endpoint.

## Questions before shipping to production

- **Persistence:** the store is in memory, so every restart deletes all data and it can't run on more than one instance. What database is planned?
- **Auth:** who is allowed to create, delete or assign tasks? Should `assignee` be a user ID from an identity system rather than free text?
- **Concurrency:** two clients assigning the same task at once means the last write wins. Do we need optimistic locking?
- **`PUT` semantics:** it currently behaves like a partial update (PATCH). Should `PUT` replace the whole task, or should it be renamed?
- **Pagination contract:** should list responses include `total` / `page` / `limit` metadata, and what is the maximum `limit`?
- **Operations:** request logging, rate limiting, a health-check endpoint, and CORS configuration are all missing.
