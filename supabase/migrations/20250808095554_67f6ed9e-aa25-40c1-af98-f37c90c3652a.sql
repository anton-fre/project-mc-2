-- Create patients table
CREATE TABLE public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

-- Policies: owner-only access
CREATE POLICY "Users can view their own patients"
  ON public.patients
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own patients"
  ON public.patients
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own patients"
  ON public.patients
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own patients"
  ON public.patients
  FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger to maintain updated_at
CREATE TRIGGER update_patients_updated_at
BEFORE UPDATE ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add patient_id to folders to scope folders by patient (nullable for "General")
ALTER TABLE public.folders
  ADD COLUMN patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_patients_user_id ON public.patients(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_patient_id ON public.folders(patient_id);
