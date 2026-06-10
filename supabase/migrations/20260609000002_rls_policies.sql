alter table profiles enable row level security;
create policy "profiles_self" on profiles for all
  using (auth.uid() = id) with check (auth.uid() = id);

alter table videos enable row level security;
create policy "videos_self" on videos for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table outlines enable row level security;
create policy "outlines_self" on outlines for all
  using (exists (select 1 from videos v where v.id = video_id and v.user_id = auth.uid()))
  with check (exists (select 1 from videos v where v.id = video_id and v.user_id = auth.uid()));

alter table decks enable row level security;
create policy "decks_self" on decks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table cards enable row level security;
create policy "cards_self" on cards for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table review_log enable row level security;
create policy "review_log_self" on review_log for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
