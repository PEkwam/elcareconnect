-- lovable-cron-fallback-reviewed: 1440 runs/day; outbound campaign dialing has no enqueue-time wake path, calls must leave the queue within a minute, and the dispatcher returns instantly when no run is active
CREATE OR REPLACE FUNCTION public.dispatch_campaign_worker()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _secret text; _pending int;
BEGIN
  SELECT count(*) INTO _pending FROM public.campaign_runs WHERE state = 'running';
  IF _pending = 0 THEN RETURN; END IF;

  PERFORM public.reap_campaign_jobs();

  SELECT value INTO _secret FROM public.app_secrets WHERE key = 'CRON_SECRET';
  IF _secret IS NULL OR _secret = '' THEN
    RAISE WARNING 'dispatch_campaign_worker: CRON_SECRET is not configured';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://puaynqufnkgkbmaeslsj.supabase.co/functions/v1/campaign-worker',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', _secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dispatch_campaign_worker() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_campaign_worker() TO service_role;

SELECT cron.schedule('campaign-worker-tick', '* * * * *', $cron$SELECT public.dispatch_campaign_worker();$cron$);