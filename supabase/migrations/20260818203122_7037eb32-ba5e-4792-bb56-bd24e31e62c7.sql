-- 1. Lock down SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.claim_campaign_jobs(text,integer,integer,uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_idempotency_key(text,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_rate_limit(text,integer,integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_outbound_call_events_partition(date) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_audit_event(text,text,text,uuid,inet,text,jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_outbound_call_events(integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reap_campaign_jobs() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_analytics_views() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.store_idempotency_response(text,jsonb) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_agent_daily_performance(date,date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_call_hourly_volume(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_campaign_daily_stats(date,date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_sentiment_daily(date,date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_supervisor_or_admin(uuid) FROM anon;

-- 2. Materialized views out of the Data API
REVOKE ALL ON public.mv_agent_daily_performance FROM anon, authenticated;
REVOKE ALL ON public.mv_call_hourly_volume FROM anon, authenticated;
REVOKE ALL ON public.mv_campaign_daily_stats FROM anon, authenticated;
REVOKE ALL ON public.mv_sentiment_daily FROM anon, authenticated;
GRANT SELECT ON public.mv_agent_daily_performance TO service_role;
GRANT SELECT ON public.mv_call_hourly_volume TO service_role;
GRANT SELECT ON public.mv_campaign_daily_stats TO service_role;
GRANT SELECT ON public.mv_sentiment_daily TO service_role;

-- 3. user_id linkage for agent tables
ALTER TABLE public.agent_shifts ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.agent_skills ADD COLUMN IF NOT EXISTS user_id uuid;

UPDATE public.agent_shifts s SET user_id = p.user_id
  FROM public.profiles p WHERE s.user_id IS NULL AND lower(p.email) = lower(s.agent_email);
UPDATE public.agent_skills s SET user_id = p.user_id
  FROM public.profiles p WHERE s.user_id IS NULL AND lower(p.email) = lower(s.agent_email);
UPDATE public.agent_status s SET user_id = p.user_id
  FROM public.profiles p WHERE s.user_id IS NULL AND lower(p.email) = lower(s.agent_email);

DROP POLICY IF EXISTS agent_own_shifts ON public.agent_shifts;
CREATE POLICY agent_own_shifts ON public.agent_shifts FOR ALL TO authenticated
  USING (user_id = auth.uid() OR (user_id IS NULL AND lower(agent_email) = lower(auth.email())) OR public.is_supervisor_or_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR (user_id IS NULL AND lower(agent_email) = lower(auth.email())) OR public.is_supervisor_or_admin(auth.uid()));

DROP POLICY IF EXISTS agent_own_skills ON public.agent_skills;
CREATE POLICY agent_own_skills ON public.agent_skills FOR ALL TO authenticated
  USING (user_id = auth.uid() OR (user_id IS NULL AND lower(agent_email) = lower(auth.email())) OR public.is_supervisor_or_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR (user_id IS NULL AND lower(agent_email) = lower(auth.email())) OR public.is_supervisor_or_admin(auth.uid()));

DROP POLICY IF EXISTS agent_own_status ON public.agent_status;
CREATE POLICY agent_own_status ON public.agent_status FOR ALL TO authenticated
  USING (user_id = auth.uid() OR (user_id IS NULL AND lower(agent_email) = lower(auth.email())) OR public.is_supervisor_or_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR (user_id IS NULL AND lower(agent_email) = lower(auth.email())) OR public.is_supervisor_or_admin(auth.uid()));

-- 4. chat_messages: owner + supervisor/admin only
DROP POLICY IF EXISTS staff_all_chat_messages ON public.chat_messages;
CREATE POLICY chat_messages_owner_access ON public.chat_messages FOR ALL TO authenticated
  USING (user_id = auth.uid() OR (user_id IS NULL AND lower(agent_email) = lower(auth.email())) OR public.is_supervisor_or_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR (user_id IS NULL AND lower(agent_email) = lower(auth.email())) OR public.is_supervisor_or_admin(auth.uid()));

-- 5. Explicit read policies on call event partitions
DO $$
DECLARE p text;
BEGIN
  FOR p IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relkind='r' AND c.relname ~ '^outbound_call_events_[0-9]{4}_[0-9]{2}$'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p);
    EXECUTE format('DROP POLICY IF EXISTS supervisors_read_events ON public.%I', p);
    EXECUTE format('CREATE POLICY supervisors_read_events ON public.%I FOR SELECT TO authenticated USING (public.is_supervisor_or_admin(auth.uid()))', p);
  END LOOP;
END $$;