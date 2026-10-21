# An API request with a malformed key is refused with "{$error}" where the reason should be

- **Severity** low
- **Effort** small
- **Kind** regression
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: none (code; the reason is filled in)
  - 3.3: none (code; the reason is filled in)
- **Introduced** `pkp/pkp-lib#9176` for `pkp/pkp-lib#7698` · [71e79e31e3](https://github.com/pkp/pkp-lib/commit/71e79e31e3d5c827e4bfa2443bbe81e5ec4c1dba) · 2023-10-13 · Touhidur Rahman (touhidurabir)
- **Upstream** none found (2026-10-21)
- **Tracked in** spec U03 [A27](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U03-user-profile.md#a27)
- **Checked** 2026-10-21, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

An application that sends the REST API a key that cannot be decoded (a
made-up string, or a real key cut off after its second dot-separated
part) gets a 400 answer reading "The apiToken could not be decoded
because of the following error: {$error}". "{$error}" stays as it is,
where the reason should be, so the developer is not told what is wrong
with the key.

## Impact

- **Lost**: nothing. The answer only lacks the reason a developer would
  use to find the mistake.
- **Who**: developers of applications that call the REST API with a
  user's API key, when the key they send is cut short, mistyped or not
  a key at all. The answer is the same whether the key goes in the
  `Authorization: Bearer` header or in the `apiToken` parameter.
- **Way round**: compare the key sent with the one on Profile › "API
  Key"; the message gives nothing to go on.

Low: wording only.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main` (OJS, OMP or OPS; context
  `publicknowledge`).
- In `config.inc.php`, `[security]` `api_key_secret` set to any string
  (the dataset leaves it empty, and the "API Key" tab then offers no
  button).

Steps:

1. Sign in as `dbarnes`.
2. Open the Profile page on its "API Key" tab
   (`/index.php/publicknowledge/user/profile/apiSettings`).
3. Press "Create API Key". The box shows the key, three parts separated
   by dots (`eyJ0eXAiOiJKV1Qi…`).
4. Send the key as a developer would (the control):
   `curl -H 'Authorization: Bearer <the key>' '<base URL>/index.php/publicknowledge/api/v1/submissions'`.
   It answers 200 with the submissions list.
5. Send the same request with `Authorization: Bearer abc`.
6. Send it with only the key's first two parts (`<first part>.<second
   part>`, the last dot and the last part left off).
7. Send it with the key's middle part replaced by `e25vdCBqc29u` (the
   base64url of `{not json`).
8. Send step 5's token as a query parameter instead,
   `…/api/v1/submissions?apiToken=abc`, with no header.

**Expected**: steps 5 to 8 are refused with 400 and the reason filled
in. With the fix below, `main` answers steps 5, 6 and 8 with

```
{"error":"The apiToken could not be decoded because of the following error: Wrong number of segments"}
```

and step 7 with "… following error: Syntax error, malformed JSON". (3.4
filled the reason in too, though it answered 403 and put the text in an
`errorMessage` field.)

**Observed**: steps 5, 6, 7 and 8 each answer 400 with

```
{"error":"The apiToken could not be decoded because of the following error: {$error}"}
```

A key whose signature (its third part) has one character changed
answers 400 "The API token could not be validated. This may indicate an
error in the API token or that the API token is no longer valid.", with
nothing missing.

## Cause

`PKP\middleware\DecodeApiTokenWithValidation::handle()`
(`lib/pkp/classes/middleware/DecodeApiTokenWithValidation.php`) decodes
the token with `PKPJwt::decode()`. A token that cannot be decoded (wrong
number of segments, a segment that is not base64 or not JSON, an
unsupported algorithm) throws `UnexpectedValueException` or
`DomainException`, and the catch answers 400 with
`__('api.400.tokenCouldNotBeDecoded')`, passing no parameters. The
string, `"The apiToken could not be decoded because of the following
error: {$error}"` in `locale/en/api.po`, needs `error`, so the
placeholder goes out as written.

The middleware replaced 3.4's
`PKP\security\authorization\internal\ApiTokenDecodingMiddleware` when
the API moved to Laravel's router (`pkp/pkp-lib#7698`, commit
[71e79e31e3](https://github.com/pkp/pkp-lib/commit/71e79e31e3d5c827e4bfa2443bbe81e5ec4c1dba)).
The old class passed `['error' => $e->getMessage()]` with the same key.
The rewrite dropped that argument. The invalid-signature branch beside
it needs none, since its string has no placeholder.

Reach:

- Every REST API endpoint of the three apps: the middleware runs for
  every API request that carries a token, in the header or as
  `?apiToken=` (both walked).
- The other refusals of the same middleware are whole: a bad signature
  (`api.400.invalidApiToken`) and a deleted or disabled key (401,
  `api.403.unauthorized`) carry no placeholder (checked in the code and
  walked).
- The same key is used nowhere else (searched in pkp-lib and the three
  apps).

## Proposed fix

Pass the decoder's message, as 3.4 did, in
`DecodeApiTokenWithValidation::handle()`
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/api-token-undecodable-error-unfilled/fix.diff)):

```diff
                 return response()->json([
-                    'error' => __('api.400.tokenCouldNotBeDecoded'),
+                    'error' => __('api.400.tokenCouldNotBeDecoded', ['error' => $exception->getMessage()]),
                 ], Response::HTTP_BAD_REQUEST);
```

The other API answers with a placeholder pass their parameters to
`__()` the same way
(`api.files.400.fileSize` in `PKPBaseController`,
`api.publicFiles.400.extensionNotSupported` in
`PKPUploadPublicFileController`). The messages that fill it are the JWT library's fixed texts
("Wrong number of segments", "Syntax error, malformed JSON", "Algorithm
not supported", "Expired token"), which 3.4 and 3.3 already returned.
Tried on `main` in OJS, OMP and OPS: steps 5 to 8 gave the Expected
answers, and the neighbouring ones (no token, the valid key, a changed
signature, a deleted key) were the same with the fix in and out.

**Alternatives**:

- Drop "{$error}" from the string in every locale: the answer would read
  whole but lose the reason 3.4 gave, and 44 translations would change with the English string.

**What goes with it**:

- Two translations spell the placeholder wrongly and stay unfilled with
  the fix: Danish `{$ error}` and Norwegian Bokmål `{error}` in
  `locale/{da,nb_NO}/api.po` (fixed through PKP's translation platform).
- Backport: the same one-line change on `stable-3_5_0`, as its own
  patch
  ([fix-3_5.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/api-token-undecodable-error-unfilled/fix-3_5.diff)).
  `fix.diff` does not apply there: on `main` the branch also writes an
  `AuditLog::log()` line
  ([8a586abc5a](https://github.com/pkp/pkp-lib/commit/8a586abc5a76e9b29d14312deb6ce535fbb526cf),
  `pkp/pkp-lib#12336`), which 3.5 lacks, so the diff's context differs.
- Guard: a test that an undecodable token's answer holds no "{$".
- Not covered, a different surface: `api.themes.404.themeUnavailable`
  ("The active theme, {$themePluginPath}, …") is also translated with
  no parameter in `PKPContextController` and `PKPSiteController`, as it
  already was in 3.4.

Small: one argument in one middleware, with a test.

## Evidence

- Kept script:
  [`shared/playwright/checks/issues/api-token-undecodable-error-unfilled/walk.js`](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/api-token-undecodable-error-unfilled/walk.js)
  (helpers in `lib.js` beside it). On a dataset fleet freshly reset to
  the default dataset: `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node
  bin/probe.js <ojs|omp|ops|all> shared/playwright/checks/issues/api-token-undecodable-error-unfilled/walk.js
  [steps|neighbour]`. It sets `api_key_secret` in the fleet's config for
  the run and puts it back; the requests are the curl of the Steps, sent
  without a cookie.
- Walked on `main` and `stable-3_5_0`, OJS, OMP and OPS, PostgreSQL,
  datasets commit 5f247d04 (2026-10-20).
- Tips: OJS `main` 3109a59114 (lib/pkp f37a174626), OMP `main` 5777025be
  and OPS `main` f048e747b4 (lib/pkp 042726ebf6); OJS 3.5 1e78ca0c2b,
  OMP 3.5 cce424e5e, OPS 3.5 5eca7fd603 (lib/pkp 68512b5fda);
  pkp-lib `stable-3_4_0` 85f47442cf, `stable-3_3_0` 867ce82d8e.
- Code reads: `DecodeApiTokenWithValidation::handle()` on `main` and
  `stable-3_5_0` (the same catch); 3.4's
  `classes/security/authorization/internal/ApiTokenDecodingMiddleware.php`
  and 3.3's `ApiTokenDecodingMiddleware.inc.php`, which pass
  `['error' => $e->getMessage()]` to `APIRouter::handleAuthorizationFailure()`,
  answering 403 with `errorMessage` filled (not walked there). Blame:
  the line is unchanged since 71e79e31e3; its parent holds the old class
  with the parameter. `PKPJwt::decode()` and the vendored
  `Firebase\JWT\JWT` for the messages.
- Fix trial on `main`, OJS, OMP and OPS: `node bin/try-fix.js apply
  shared/playwright/checks/issues/api-token-undecodable-error-unfilled/fix.diff
  ojs omp ops`, the fleet reset, the kept script as `steps` and as
  `neighbour` (no token, the key, a changed signature, "Delete" then the
  deleted key), then `node bin/try-fix.js revert` and `neighbour` again.
- `fix-3_5.diff`: `git apply --check -p3` passes in 3.5's `lib/pkp`
  (68512b5fda) and `fix.diff` fails there; not applied nor walked on 3.5.
- Upstream search 2026-10-21, pkp/pkp-lib and pkp/ojs issues and PRs:
  "apiToken could not be decoded", `tokenCouldNotBeDecoded`,
  `DecodeApiTokenWithValidation`, "{$error}" api token; no report of
  this fault.
- Unverified: the Danish and Norwegian answers with the fix (read in
  the locale files only).
