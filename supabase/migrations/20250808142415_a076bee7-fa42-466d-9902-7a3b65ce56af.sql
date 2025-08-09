-- Add priority column to questions with bounds 1..10 and default 5
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 5;

-- Enforce bounds via a check constraint (immutable)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'questions_priority_range_chk'
  ) THEN
    ALTER TABLE public.questions
    ADD CONSTRAINT questions_priority_range_chk CHECK (priority >= 1 AND priority <= 10);
  END IF;
END $$;