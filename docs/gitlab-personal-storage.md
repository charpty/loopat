# GitLab Personal Storage

Loopat can use a GitLab-compatible repository for encrypted personal storage.
GitHub remains the default; administrators can select GitLab through workspace
configuration or environment variables.

```jsonc
{
  "gitHost": {
    "provider": "gitlab",
    "baseUrl": "https://gitlab.example.com",
    "defaultRepo": "team/loopat-personal"
  }
}
```

Equivalent environment variables are:

```sh
LOOPAT_GIT_HOST_PROVIDER=gitlab
LOOPAT_GIT_HOST_BASE_URL=https://gitlab.example.com
LOOPAT_GIT_HOST_DEFAULT_REPO=team/loopat-personal
```

## Design

The implementation uses the existing `GitHostProvider` abstraction rather than
adding GitLab conditionals to the personal-storage workflow. Provider resolution
uses the following precedence:

1. An extension under `LOOPAT_HOME/extensions/providers/`.
2. A provider explicitly supplied by the request.
3. `LOOPAT_GIT_HOST_PROVIDER` or `LOOPAT_GIT_PROVIDER`.
4. Workspace `config.json` field `gitHost.provider`.
5. Built-in `github`.

`resolveGitHostSettings()` applies the same request, environment, workspace, and
provider-default precedence to `baseUrl` and `defaultRepo`.

For GitLab, `baseUrl` is the human-facing site root. The provider derives the
REST endpoint as `${baseUrl}/api/v4`; a configured URL that already ends in
`/api/v4` is normalized back to the site root when building web and clone URLs.

## Authentication

### Token flow

The standard flow uses a personal or project access token with these scopes:

- `api`
- `read_repository`
- `write_repository`

API requests try the standard `PRIVATE-TOKEN` header first, followed by bearer
authentication and the `private_token` query parameter for compatible
self-hosted deployments. Redirects, HTML responses, and authentication errors
advance to the next mode.

Git clone and push use the provider's `https-token` mode:

```text
https://<resolved-username-or-oauth2>:<token>@gitlab.example.com/<namespace>/<project>.git
```

The provider reads standard GitLab user responses and common wrapped enterprise
responses. If the profile endpoint does not expose a namespace username, a
successful project-list request can still validate the token. The user must then
enter a full `namespace/project` path; Loopat uses `oauth2` only as the non-empty
HTTPS Basic Auth username.

### Administrator-pinned SSH flow

Some self-hosted installations place the API behind SSO while leaving SSH git
access available. When an administrator configures a full `namespace/project`
as `defaultRepo`, Loopat resolves it to an SSH URL and skips token onboarding:

```text
git@gitlab.example.com:team/loopat-personal.git
```

Direct SSH uses the operating-system account that runs Loopat. Request-body
overrides cannot select another host-SSH repository; the repository must come
from administrator-controlled workspace or environment configuration. Verify
that the process account has write access before enabling this mode.

The imported repository records `loopat.personalSshAuth=host` in local Git
configuration. Initial push, fetch, pull, delete synchronization, and later
pushes all reuse the same host identity. Host key checking uses
`StrictHostKeyChecking=accept-new` when supported and falls back to `no` for
older OpenSSH versions; administrators using the fallback should pre-seed and
monitor `known_hosts`.

## Repository identity

Personal-repository commits select an author in this order:

1. Provider identity, when both name and email are available.
2. `LOOPAT_GIT_AUTHOR_NAME` and `LOOPAT_GIT_AUTHOR_EMAIL`.
3. Existing repository or process-account Git configuration.
4. Loopat's local fallback identity.

Installations with commit-email push rules should configure an accepted email
through the environment or the process account's Git configuration.

## Runtime flow

1. The UI calls `GET /api/personal/status`.
2. The server resolves the active git host, base URL, and default repository.
3. For token mode, the UI authenticates and lists repositories through the
   provider.
4. For direct SSH mode, the UI shows the administrator-pinned repository for
   confirmation and skips token entry.
5. The backward-compatible `POST /api/personal/github` route delegates setup to
   the active provider.
6. `setupPersonalViaProvider()` clones or initializes the repository, imports
   the personal data, and configures git-crypt when needed.

## Code map

- `server/src/gitlab.ts` implements the GitLab API adapter, response parsing,
  repository creation, project listing, and direct SSH resolution.
- `server/src/providers.ts` registers built-in providers and resolves active git
  host settings.
- `server/src/index.ts` routes personal status, repository listing, and setup
  through the active provider.
- `server/src/loops.ts` preserves full namespace paths and applies the selected
  Git authentication mode to all synchronization operations.
- `web/src/components/dialog/PersonalRepoPanel.tsx` renders token and direct SSH
  onboarding from the provider-neutral status response.
- `server/src/git-author.ts` selects a push-rule-compatible commit identity.

## Validation

```sh
bun test server/test/gitlab.test.ts server/test/git-author.test.ts
bunx tsc -p server/tsconfig.json --noEmit
bun run build
```

End-to-end validation additionally requires either a usable GitLab token or SSH
write access from the Loopat process account.

## Limitations

- The public setup route is still named `/api/personal/github` for backward
  compatibility. A provider-neutral alias can be added separately.
- Group and subgroup project creation depends on
  `GET /api/v4/namespaces/:path` and the token's namespace permissions.
- Repository listing currently reads the first 100 membership projects.
- Direct SSH currently assumes the GitLab SSH service uses its standard port.
