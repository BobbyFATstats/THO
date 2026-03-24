# Decision Log

| Date | Decision | Options Considered | Chosen | Rationale |
|------|----------|-------------------|--------|-----------|
| 2026-03-24 | GHL opportunities search param format | snake_case (`location_id`, `pipeline_id`) vs camelCase (`locationId`, `pipelineId`) | camelCase | GHL API v2 expects camelCase for all query params. snake_case was causing 422 Unprocessable Entity errors. |
| 2026-03-24 | GHL error handling verbosity | Silent throw vs capture response body | Capture response body in error message | Bare status codes made debugging GHL API issues difficult. Including the response body surfaces the actual validation error. |
| 2026-03-24 | Session log format and location | Single SESSION_LOG.md vs individual files in `sessions/` | Individual files in `sessions/` | Easier to scan by date, avoids one massive file, better for context handoff between sessions. |
