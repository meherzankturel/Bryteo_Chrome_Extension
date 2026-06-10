create table rate_limits (
  user_id        uuid not null references profiles(id) on delete cascade,
  day            date not null,
  outlines_today int not null default 0,
  cards_today    int not null default 0,
  primary key (user_id, day)
);

alter table rate_limits enable row level security;
create policy "rate_limits_self_read" on rate_limits for select
  using (auth.uid() = user_id);
-- writes only via service-role from Edge Functions; no insert/update policy needed.
