-- 1) Add patient_id to questions
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS patient_id UUID NULL;

-- 2) Foreign key to patients table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'questions_patient_id_fkey'
  ) THEN
    ALTER TABLE public.questions
    ADD CONSTRAINT questions_patient_id_fkey
    FOREIGN KEY (patient_id) REFERENCES public.patients(id)
    ON DELETE SET NULL;
  END IF;
END $$;

-- 3) Helpful index for filtering by user + patient
CREATE INDEX IF NOT EXISTS idx_questions_user_patient ON public.questions(user_id, patient_id);

-- 4) Ensure each user with questions has an 'MC' patient row
INSERT INTO public.patients (user_id, name)
SELECT DISTINCT q.user_id, 'MC'
FROM public.questions q
LEFT JOIN public.patients p
  ON p.user_id = q.user_id AND lower(p.name) = 'mc'
WHERE p.id IS NULL;

-- 5) Backfill existing questions to patient 'MC'
UPDATE public.questions q
SET patient_id = p.id
FROM public.patients p
WHERE q.patient_id IS NULL
  AND p.user_id = q.user_id
  AND lower(p.name) = 'mc';