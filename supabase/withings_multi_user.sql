-- VitaTrack Withings: isolate one Withings connection per VitaTrack session/user.
-- Existing legacy rows remain untouched (app_user_id = NULL) and are ignored by v5.
-- Reconnect Withings once after deploying this migration.

alter table public.withings_connection
  add column if not exists app_user_id text;

create unique index if not exists withings_connection_app_user_id_uidx
  on public.withings_connection (app_user_id)
  where app_user_id is not null;

create index if not exists withings_connection_updated_at_idx
  on public.withings_connection (updated_at desc);
