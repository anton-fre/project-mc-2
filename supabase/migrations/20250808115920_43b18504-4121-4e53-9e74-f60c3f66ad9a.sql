-- Add optional patient_id to appointments and index
ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS patient_id uuid NULL;

-- Optional FK to patients table for integrity
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_patient_fk'
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_patient_fk
      FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_appointments_user_patient_start ON public.appointments(user_id, patient_id, start_at);
