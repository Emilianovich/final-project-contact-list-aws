# HTTP contract — phase 2

This contract is specified before backend implementation. Integration tests exercise an actual HTTP API backed by Postgres; mocks and silent skips are not acceptable. Run with `API_TEST_URL=http://localhost:3000 node --test apps/api/test/api.integration.test.mjs`. Use a disposable test database: tests register isolated users and deliberately retain rows for inspection.

## Authentication

`POST /auth/register` accepts `{email,password}`, returns 201 `{accessToken,refreshToken,user:{id,email}}`; login uses the same input and returns 200 of the same shape. Email is trimmed and case-normalized. Password minimum is 12 characters. Duplicate email returns 409 `EMAIL_EXISTS`; incorrect credentials return 401 `UNAUTHORIZED` without distinguishing missing users. `GET /auth/me` accepts only an Authorization Bearer JWT and returns `{id,email}`. Access tokens expire after 900 seconds. Invalid, expired or absent tokens return 401 `UNAUTHORIZED`. Responses never expose password hashes. Tokens are returned in JSON, never cookies. Refresh JWTs expire absolutely 604800 seconds after login. `POST /auth/refresh` accepts `{refreshToken}` and returns 200 with a rotated token pair and user. Refresh tokens are single-use: replay revokes the entire session family, including access tokens issued by it. `POST /auth/logout` accepts `{refreshToken}` and returns 204, revoking that family and its access tokens. Access verification checks the session; unrelated sessions remain usable. Access tokens cannot refresh and refresh tokens cannot authorize resource access. Invalid refresh tokens return 401 `UNAUTHORIZED`.

## Contacts

All routes require authentication. Input `{name,email,country,phone}` follows shared validation: 2–100 character name, valid email, ISO country, valid phone belonging to that country. Output is `{id,userId,name,email,country,phoneE164,createdAt,updatedAt,deletedAt}`. Dates are ISO timestamps; active `deletedAt` is null. Server generates identity, owner and dates. Unknown input fields, including owner/identity/deletion fields, return 400.

- `POST /contacts` → 201 contact.
- `GET /contacts?status=active|deleted&q=...&country=PA` → 200 `{items:Contact[]}`. Default active; search is case-insensitive partial name OR email; country/search/status combine with AND. Sort by name. Invalid country/status returns 400.
- `GET /contacts/:id` → 200 owned contact, including deleted.
- `PATCH /contacts/:id` takes a complete contact input → 200 updated active contact. Editing deleted contacts returns 409 `CONTACT_DELETED`.
- `DELETE /contacts/:id` → 200 soft-deleted contact; repeated deletion is idempotent.
- `POST /contacts/:id/restore` → 200 active contact; repeated restoration is idempotent.

Missing and foreign UUIDs return 404 `NOT_FOUND` for every item operation. Malformed UUID returns 400. The unique key `(user_id,phone_e164)` includes trash and is database-enforced. Another active contact with the same normalized number returns 409 `PHONE_EXISTS`; a trashed one returns 409 `PHONE_DELETED`. Both may include the owner's conflicting `contactId`. Different users may share a number. Editing one's existing number is permitted.

## Errors and CORS

Errors have `{code:string,message:string}` (optional validation details). Validation failures use 400 `VALIDATION_ERROR`. No SQL, stack traces, hashes or secrets in responses. CORS permits `FRONTEND_ORIGIN` exactly and the Authorization/Content-Type headers. Disallowed origins must not receive Access-Control-Allow-Origin; CORS does not replace authorization. Integration tests use `TEST_FRONTEND_ORIGIN` (default `http://localhost:8080`).

For expiration enforcement tests set `TEST_JWT_ACCESS_SECRET` to the isolated test API's access signing secret. The test process signs an already-expired token, so expiry is tested without waiting 15 minutes. Missing this test-only variable fails the suite explicitly; never use a production secret.

Refresh expiry enforcement additionally requires `TEST_JWT_REFRESH_SECRET` matching the disposable API. Both signing-secret tests first prove their secret can produce an accepted token; this prevents false positives from an incorrect test secret.
