-- Drain queued Twilio call status events every minute so finished calls
-- stop showing as "in progress".
select cron.unschedule(jobid) from cron.job where jobname = 'drain-outbound-call-events';

select cron.schedule(
  'drain-outbound-call-events',
  '* * * * *',
  $$select public.process_outbound_call_events(1000);$$
);

-- Process the existing backlog now.
select public.process_outbound_call_events(1000);