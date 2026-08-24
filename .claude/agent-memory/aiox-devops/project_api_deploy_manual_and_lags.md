---
name: loyola-api-deploy-is-manual-and-lags
description: packages/web auto-deploys via Vercel but packages/api needs a manual deploy (Railway) owned by Lucas — it chronically lags main, so merge is not ship
metadata:
  type: project
---

In this monorepo, merging to `main` ships only half the product. `packages/web` is auto-published by Vercel on merge. `packages/api` requires a **manual deploy** that Lucas owns, and it has repeatedly sat behind `main` for multiple stories at a time (44.9 shipped a route that 404'd in production until the API caught up).

**Why:** This turns "merged" into a false completion signal, and for any story whose value lives in a **cache the API writes**, the lag is destructive rather than merely inert. Story 44.12 is the sharp case: a backfill was run against production from branch-only code, giving 13 of 15 stages `coberturaDiaria` and arming the tracking guard on all 7 free stages. Until the deployed API carries that code, the **daily sync rewrites those caches without the field and switches the guard back off** — the validated work has an expiry date measured in one sync cycle.

**How to apply:** Every PR touching `packages/api` must carry an explicit post-merge deploy note in the body, and when the change writes or backfills a cache, say what breaks and *when* if the deploy slips. Never report a story as shipped on merge alone — check whether the API side is live. Related: [[commit-qa-gate-before-pr]].
