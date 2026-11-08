# SDD Research: account-configuration

schema: gentle-ai.sdd-research/v1
revision: 2
outcome: blocked

## Selected request

The user selected **Investigate first** (`run-research`). Research completion is mandatory before proposal. The requested research is technical evidence to inform, not decide, the open questions below. Do not create or modify proposal, specs, design, tasks, or application source during this phase.

## Questions

1. Compare JSONDB integrity constraints with a transactional relational migration for paired transfers, fees, and normalization dependencies.
2. Research exact-decimal or minor-unit handling across currencies and allocation rounding.
3. Identify legacy currency and migration evidence, including safeguards for an opening-balance cutoff.
4. Examine the current recurrence template/virtual-occurrence limitations and safe posted-once lifecycle patterns.
5. Identify alert scheduling and background-execution options available to the existing app and deployment.
6. Examine account lifecycle/settings, mobile navigation, and privacy implications.

## Admission

- Requested evidence classes: `documentation`, `open-web`.
- Product-owner decision recorded in the prior artifact: `documentation` granted; `open-web` denied.
- Exact runtime grants available in this invocation: `documentation=[]`, `open-web=[]`.
- Result: **denied**. No requested evidence class has an admitted runtime grant. The persisted product-owner decision does not substitute for the missing runtime capability declaration; source research stopped before collecting sources or validating claims.
- Proposal readiness: blocked pending admitted research and later confirmation of product decisions.

## Sources

None. Admission was denied, so no technical sources were accessed or admitted in this invocation.

## Validated claims

None. Admission was denied; this artifact intentionally makes no source-backed technical claims.

## Contradictions, uncertainty, and freshness

- Technical questions remain unanswered because the requested evidence classes were not admitted.
- No source freshness assessment was possible.
- The exploration artifact is retained as task context only, not as validated research evidence: `openspec/changes/account-configuration/exploration.md`.
- The complete feature scope and all 23 acceptance criteria remain preserved in that exploration artifact; this blocked rerun did not modify it.

## Product choices — non-authoritative and pending

No product behavior was chosen in this research phase. The product owner must later confirm, without inference:

- legacy refund account attribution;
- legacy currency mapping;
- opening-balance cutoff;
- occurrence-edit semantics;
- mobile navigation for Settings; and
- whether alerts require always-on background execution.

## Recovery

Retain the `run-research` selection and all six questions above. This executor did not retry or seek additional grants. A future authorized phase dispatch requires a runtime capability declaration admitting the documentation class; open-web remains denied. Keep proposal blocked until research is complete and the pending product decisions are confirmed by the product owner.

## Evidence-Grant Decision

Status: answered by the product owner.

- `documentation`: granted (`grant_documentation`; label: “Permitir”).
- `open-web`: denied (`deny_open_web`; label: “No permitir”).

Runtime status for revision 2: the current invocation exposed no admitted evidence grants (`documentation=[]`, `open-web=[]`). No evidence was collected. Do not treat the persisted grant decision as a runtime capability, access open-web sources, or infer consent. The six questions remain unanswered and proposal remains blocked. The product-owner decisions listed above remain unconfirmed.
