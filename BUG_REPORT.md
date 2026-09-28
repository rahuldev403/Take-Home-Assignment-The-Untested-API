# Bug Report — Task API

Every bug below was found by a test and then reproduced against the running API. Each one has a test in `task-api/tests/`:

- **Fixed** bugs now have ordinary regression tests.
- **Open** bugs are written as `test.failing(...)`. The test states the correct behaviour, so it fails today and Jest counts it as a pass. When someone fixes the bug, Jest will flag the test as "unexpectedly passing", which prompts them to change it to a normal `test`.

| # | Bug | Severity | Status |
|---|-----|----------|--------|
| 1 | Pagination skips the first page | High | ✅ Fixed |
| 2 | Status filter matches substrings | Medium | ✅ Fixed |
| 3 | Completing a task resets its priority | Medium | ✅ Fixed |
| 4 | `PUT` lets clients overwrite `id` / `createdAt` / `completedAt` | High | ✅ Fixed |
| 5 | Falsy `status` / `priority` / `dueDate` skip validation, and `status: null` later causes a 500 | High | Open |
| 6 | Malformed JSON returns 500 instead of 400 | Low | Open |
| 7 | `completedAt` gets out of sync with `status` when edited through `PUT` | Medium | Open |
| 8 | README documents the wrong status values | Low | ✅ Fixed (docs) |

---

## 1. Pagination skips the first page ✅

- **Where:** `src/services/taskService.js`, `getPaginated`: `const offset = page * limit;`
- **Expected:** `GET /tasks?page=1&limit=2` returns tasks 1–2.
- **Actual:** it returns tasks 3–4. Page 1 is treated as the second page, so the first `limit` tasks can never be reached. (The route defaults `page` to `1`, which shows it expects pages to start at 1.)
- **Why:** the offset formula assumes pages start at 0, but the API's pages start at 1.
- **Found by:** `page 1 returns the first limit tasks` (unit) and `page=1 returns the first page` (integration). With 3 tasks, the integration test got `['T3']`.
- **Fix (applied):** `const offset = (page - 1) * limit;`

## 2. Status filter matches substrings ✅

- **Where:** `taskService.js`, `getByStatus`: `t.status.includes(status)`
- **Expected:** `?status=do` returns nothing, because `do` is not a valid status.
- **Actual:** it returns both `todo` and `done` tasks. `String.prototype.includes` checks whether one string contains another; it does not test equality.
- **Found by:** `does not match on a partial status string`.
- **Fix (applied):** `t.status === status`. The route could also reject unknown statuses with a 400. I didn't add that, to keep the change small.

## 3. Completing a task resets its priority ✅

- **Where:** `taskService.js`, `completeTask`, which hard-codes `priority: 'medium'` in the updated object.
- **Expected:** `PATCH /tasks/:id/complete` changes only `status` and `completedAt`.
- **Actual:** a `high` priority task becomes `medium` when completed, and the original value is lost.
- **Found by:** `keeps the original priority`.
- **Fix (applied):** removed the line.

## 4. `PUT` can overwrite server-owned fields ✅

- **Where:** `taskService.js`, `update`: `{ ...tasks[index], ...fields }`, with `fields` being the raw `req.body`. `validateUpdateTask` only checks the fields it knows about and lets any other key through.
- **Expected:** `id`, `createdAt` and `completedAt` can't be changed by a client.
- **Actual:** `PUT /tasks/:id {"id":"hijacked"}` changes the task's id, so the old URL returns 404. `createdAt` can be backdated, and unrelated keys (such as `isAdmin`) get stored. This is a mass-assignment vulnerability.
- **Found by:** `ignores attempts to change the id` / `does not let callers overwrite id or createdAt`.
- **Fix (applied):** `update` now copies only fields on an allowlist (`title, description, status, priority, dueDate`). I put the filter in the service rather than the route so that every caller of `update` gets the same protection. The allowlist also stops `PUT` from being used to set `assignee` without validation.

## 5. Falsy values skip validation; `status: null` crashes the list endpoint (open)

- **Where:** `src/utils/validators.js`. Each check is guarded by truthiness, for example `if (body.status && !VALID_STATUSES.includes(body.status))`.
- **Expected:** `status: null`, `status: ""`, `priority: 0`, etc. are rejected with 400.
- **Actual:** these values fail the truthiness check, so validation is skipped and the value is stored. Once a task has `status: null`, the old `includes` code made `GET /tasks?status=…` throw `TypeError: Cannot read properties of null`, which returned a **500 for every request that filters by status**. After fix #2 the crash is gone, but the invalid task still exists and is left out of `/stats` counts.
- **Found by:** `rejects a null status instead of storing it` and `rejects a falsy status/priority`.
- **Fix:** check whether the key is present (`body.status !== undefined`) instead of whether the value is truthy. On create, decide whether `null` should mean "use the default" or be a 400. I'd return 400.

## 6. Malformed JSON returns 500 (open)

- **Where:** `src/app.js`, the error handler, which always responds with `res.status(500)`.
- **Expected:** a request body like `{"title": ` returns **400** Bad Request.
- **Actual:** 500 Internal Server Error, plus a stack trace logged for what is a client mistake. `express.json()` raises the error with `err.status = 400` and `err.type = 'entity.parse.failed'`, but the handler ignores both.
- **Found by:** `returns 400 for malformed JSON`.
- **Fix:** `res.status(err.status && err.status < 500 ? err.status : 500)` and only log errors that are genuinely 5xx.

## 7. `completedAt` and `status` can get out of sync (open)

- **Where:** only `completeTask` sets `completedAt`. `update` never changes it.
- **Expected:** moving a `done` task back to `todo` clears `completedAt`, and setting `status: 'done'` through `PUT` sets it.
- **Actual:** a reopened task keeps its old `completedAt`, and a task marked done through `PUT` has `completedAt: null`.
- **Found by:** `clears completedAt when a done task is moved back to todo`.
- **Fix:** in `update`, set `completedAt` whenever `status` changes to or from `done`.

## 8. README documents the wrong status values ✅

`README.md` lists statuses as `pending | in-progress | completed`, but the code (and `ASSIGNMENT.md`) use `todo | in_progress | done`. A client that follows the README gets a 400 on every request that sets a status.

- **Fix (applied):** the README now lists `todo | in_progress | done` and documents the new `assignee` field.

---

## Minor observations (not filed as bugs, but worth asking about)

- `?status=` and `?page=` can't be used together. When `status` is present, pagination is silently ignored.
- `?page=-1` or `?limit=-5` aren't rejected. A negative offset makes `slice` return confusing results. `?limit=100000` is allowed, so there's no upper bound.
- Calling `PATCH /complete` on a task that is already done overwrites the original `completedAt`.
- `Date.parse` accepts strings like `"1"`, so the `dueDate` check is looser than "ISO 8601".
- Titles are validated with `trim()` but stored without trimming.
- `findById` returns the stored object itself, so any caller that changes it changes the store directly.
