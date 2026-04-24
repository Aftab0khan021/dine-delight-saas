-- ============================================================
-- pg_cron jobs for growth features
-- Requires pg_cron extension available on Supabase Pro plans.
-- For Supabase Free tier: set up manually in Dashboard → Database → Cron Jobs
-- ============================================================

-- 1. WhatsApp Re-engagement: run daily at 10:00 AM UTC
-- Calls the whatsapp-reengagement edge function
select cron.schedule(
  'whatsapp-reengagement-daily',
  '0 10 * * *', -- Every day at 10:00 AM UTC
  $$
  select
    net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/whatsapp-reengagement',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := '{}'::jsonb
    )
  $$
);

-- 2. Table Sessions Cleanup: run every hour, delete expired sessions
select cron.schedule(
  'table-sessions-cleanup-hourly',
  '0 * * * *', -- Every hour at :00
  $$
  delete from public.table_sessions
  where expires_at < now()
  $$
);

-- 3. Order Item Pairs refresh: not needed (trigger-based), but vacuum analyze for performance
select cron.schedule(
  'order-item-pairs-vacuum-weekly',
  '0 3 * * 0', -- Every Sunday at 3:00 AM UTC
  $$
  vacuum analyze public.order_item_pairs;
  vacuum analyze public.orders;
  $$
);
