-- Create questions and linking tables

-- Questions table
CREATE TABLE IF NOT EXISTS public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY IF NOT EXISTS "Users can view their own questions"
ON public.questions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can insert their own questions"
ON public.questions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update their own questions"
ON public.questions FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can delete their own questions"
ON public.questions FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_questions_updated_at ON public.questions;
CREATE TRIGGER update_questions_updated_at
BEFORE UPDATE ON public.questions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Link questions to appointments
CREATE TABLE IF NOT EXISTS public.question_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  question_id UUID NOT NULL,
  appointment_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.question_appointments ENABLE ROW LEVEL SECURITY;

-- Ensure question and appointment belong to user
CREATE POLICY IF NOT EXISTS "Users can view their own question_appointments"
ON public.question_appointments FOR SELECT
USING (
  auth.uid() = user_id AND
  EXISTS (SELECT 1 FROM public.questions q WHERE q.id = question_id AND q.user_id = auth.uid()) AND
  EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = appointment_id AND a.user_id = auth.uid())
);

CREATE POLICY IF NOT EXISTS "Users can insert their own question_appointments"
ON public.question_appointments FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (SELECT 1 FROM public.questions q WHERE q.id = question_id AND q.user_id = auth.uid()) AND
  EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = appointment_id AND a.user_id = auth.uid())
);

CREATE POLICY IF NOT EXISTS "Users can delete their own question_appointments"
ON public.question_appointments FOR DELETE
USING (
  auth.uid() = user_id AND
  EXISTS (SELECT 1 FROM public.questions q WHERE q.id = question_id AND q.user_id = auth.uid()) AND
  EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = appointment_id AND a.user_id = auth.uid())
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_question_appointments_question_id ON public.question_appointments (question_id);
CREATE INDEX IF NOT EXISTS idx_question_appointments_appointment_id ON public.question_appointments (appointment_id);

-- Link questions to files (by storage path)
CREATE TABLE IF NOT EXISTS public.question_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  question_id UUID NOT NULL,
  storage_object_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.question_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view their own question_files"
ON public.question_files FOR SELECT
USING (
  auth.uid() = user_id AND
  EXISTS (SELECT 1 FROM public.questions q WHERE q.id = question_id AND q.user_id = auth.uid())
);

CREATE POLICY IF NOT EXISTS "Users can insert their own question_files"
ON public.question_files FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (SELECT 1 FROM public.questions q WHERE q.id = question_id AND q.user_id = auth.uid())
);

CREATE POLICY IF NOT EXISTS "Users can delete their own question_files"
ON public.question_files FOR DELETE
USING (
  auth.uid() = user_id AND
  EXISTS (SELECT 1 FROM public.questions q WHERE q.id = question_id AND q.user_id = auth.uid())
);

CREATE INDEX IF NOT EXISTS idx_question_files_question_id ON public.question_files (question_id);