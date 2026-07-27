# Scoped Exceptions

Scoped exceptions are local JSON rules in `ScannerSettings.scopedExceptions`.

Supported scopes:

- `exact-url`
- `url-prefix`
- `exact-hostname`
- `subdomain`
- `development-host`
- `global-rule`

Exceptions are rule-specific through `ruleIds`. Disabled and expired exceptions are ignored. Exact-hostname matching does not match attacker suffixes such as `example.com.attacker.test`; subdomain matching must be explicit.

Prefer scoped exceptions over broad domain allowlist entries. Domain allowlist remains a legacy skip list for domains the user never wants scanned.
