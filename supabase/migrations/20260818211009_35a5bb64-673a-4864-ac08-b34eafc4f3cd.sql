REVOKE EXECUTE ON FUNCTION public.get_agent_daily_performance(date, date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_call_hourly_volume(integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_campaign_daily_stats(date, date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_sentiment_daily(date, date) FROM authenticated;