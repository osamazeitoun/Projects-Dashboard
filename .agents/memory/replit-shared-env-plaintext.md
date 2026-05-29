---
name: Shared env vars are plaintext in committed .replit
description: Why secrets must go to the Secrets store, not shared/dev/prod env vars, on Replit
---

# Shared env vars land in the committed `.replit` file

Setting an environment variable in the **shared** (or development/production)
scope via the env tooling writes its value as **plaintext into `.replit`**, which
is tracked by git and pushed to GitHub. The Secrets store is separate and is
never written to a file.

**Why:** A Procore token-encryption key was placed in the shared env scope; it
ended up as a literal value in `.replit` across all git history, which would have
leaked on the first GitHub push. CLIENT_ID/CLIENT_SECRET stored as real Secrets
stayed safe.

**How to apply:**
- Any value that is a credential, API key, token, or encryption key must go to
  the **Secrets** store (`requestEnvVar` with requestType "secret"), never the
  shared/dev/prod env scopes.
- Use shared env only for non-sensitive config (URLs, ports, feature flags).
- Before a GitHub push, grep `.replit` (and full history) for secret values, not
  just `.env` files — `.replit` is the more likely leak vector here.
- Rotating an encryption key invalidates all data encrypted with the old key
  (e.g. stored OAuth tokens become undecryptable: "unable to authenticate
  data"), so the user must reconnect/re-enter after rotation.
