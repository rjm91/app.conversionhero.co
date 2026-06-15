# Client docs

Per-client planning material — mockup specs, briefs, brand notes, plans pasted
in from ChatGPT/Gemini/etc. These are **build inputs**: the source plans we read
to produce mockups and features. They live next to the code so the plan and the
result are versioned together.

## Convention

```
docs/clients/<clientId>-<name>/<doc>.md
```

Example:

```
docs/clients/ch014-synergy-home/dynamic-hero-mockup-spec.md
```

When asked to build something for a client, check that client's folder here first.

## Privacy — IMPORTANT

This GitHub repo is **public**, so the actual client docs are **git-ignored**
(see `.gitignore`) and stay local-only. They are NOT pushed or deployed. Only
this README (the convention itself) is committed.

To share a client doc with a teammate, send the file directly — don't commit it.
