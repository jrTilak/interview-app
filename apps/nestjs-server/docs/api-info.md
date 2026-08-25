Interview creation and realtime candidate-attempt API.

Application routes require a Better Auth session cookie unless explicitly documented as public. Request bodies and parameters are strictly validated. Validation failures use HTTP 422, ownership checks hide foreign resources as 404, and unexpected server failures are sanitized.

New interviews are private. Their owner publishes or unpublishes them through `PATCH /api/interviews/:id` with `isPublic`; public previews and authenticated candidate attempts use the interview UUID itself rather than a separate share code.
