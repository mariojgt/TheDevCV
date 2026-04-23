-- ============================================================
-- The Dev CV — Employment gaps + layoff context on Experience
--
-- Adds two optional context flags to cv_experience so the editor can:
--   (1) Represent employment gaps as first-class entries with a leave
--       label (Family Care Leave, Education Leave, Sabbatical, etc.)
--       instead of hiding them — guidance from the "resume gap" podcast
--       episode: "it's impolite, if not illegal" for recruiters to press
--       on specifics, and a clearly-labeled leave reframes the gap.
--   (2) Mark a role as ended by layoff so the renderer can auto-append a
--       polite "position ended in layoff, YYYY" on the role line. Only
--       surfaced visually when the candidate has a *pattern* of short
--       tenures (≥2 sub-1-year roles in succession) — one short role
--       alone doesn't need context.
--
-- Both columns default NULL so existing experience rows keep behaving
-- exactly as before, and clients that pre-date this migration simply
-- ignore the fields.
-- ============================================================

ALTER TABLE public.cv_experience
    ADD COLUMN IF NOT EXISTS gap_reason        TEXT NULL,
    ADD COLUMN IF NOT EXISTS departure_reason  TEXT NULL;

COMMENT ON COLUMN public.cv_experience.gap_reason IS
    'When NOT NULL this row represents an employment gap, not a job. Expected values: family_care | education | relocation | sabbatical | medical | other.';

COMMENT ON COLUMN public.cv_experience.departure_reason IS
    'Optional reason the role ended. Only ''layoff'' is currently rendered (appends a note to the role line). Other values are reserved for future use.';
