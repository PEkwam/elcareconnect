ALTER TABLE public.outbound_calls
  ADD COLUMN IF NOT EXISTS call_language text,
  ADD COLUMN IF NOT EXISTS language_selected_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_outbound_calls_phone_created
  ON public.outbound_calls (phone_number, created_at DESC);