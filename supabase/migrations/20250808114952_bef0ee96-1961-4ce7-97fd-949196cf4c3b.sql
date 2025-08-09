-- Create appointments table
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS for appointments
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- RLS policies for appointments
CREATE POLICY IF NOT EXISTS "Users can view their own appointments"
ON public.appointments
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can insert their own appointments"
ON public.appointments
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update their own appointments"
ON public.appointments
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can delete their own appointments"
ON public.appointments
FOR DELETE
USING (auth.uid() = user_id);

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_appointments_updated_at ON public.appointments;
CREATE TRIGGER update_appointments_updated_at
BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create appointment_files join table
CREATE TABLE IF NOT EXISTS public.appointment_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  appointment_id UUID NOT NULL,
  storage_object_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK to appointments (safe: public schema)
ALTER TABLE public.appointment_files
  DROP CONSTRAINT IF EXISTS appointment_files_appointment_fk,
  ADD CONSTRAINT appointment_files_appointment_fk
  FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE;

-- Enable RLS for appointment_files
ALTER TABLE public.appointment_files ENABLE ROW LEVEL SECURITY;

-- RLS policies for appointment_files
CREATE POLICY IF NOT EXISTS "Users can view their own appointment files"
ON public.appointment_files
FOR SELECT
USING (
  auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = appointment_id AND a.user_id = auth.uid()
  )
);

CREATE POLICY IF NOT EXISTS "Users can insert their own appointment files"
ON public.appointment_files
FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = appointment_id AND a.user_id = auth.uid()
  )
);

CREATE POLICY IF NOT EXISTS "Users can update their own appointment files"
ON public.appointment_files
FOR UPDATE
USING (
  auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = appointment_id AND a.user_id = auth.uid()
  )
);

CREATE POLICY IF NOT EXISTS "Users can delete their own appointment files"
ON public.appointment_files
FOR DELETE
USING (
  auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = appointment_id AND a.user_id = auth.uid()
  )
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_appointments_user_start ON public.appointments(user_id, start_at);
CREATE INDEX IF NOT EXISTS idx_appointment_files_user_appt ON public.appointment_files(user_id, appointment_id);
