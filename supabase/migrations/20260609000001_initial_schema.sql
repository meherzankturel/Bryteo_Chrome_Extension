-- profiles
create table profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               text,
  pro_status          text not null default 'free' check (pro_status in ('free','pro','founding','student')),
  pro_expires_at      timestamptz,
  ls_customer_id      text,
  ls_subscription_id  text,
  card_count          int not null default 0,
  notification_hour   int default 8 check (notification_hour between 0 and 23),
  created_at          timestamptz not null default now()
);

-- videos
create table videos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  yt_video_id   text not null,
  title         text not null,
  channel       text,
  duration_s    int,
  thumbnail_url text,
  created_at    timestamptz not null default now(),
  unique (user_id, yt_video_id)
);

create index videos_user_idx on videos (user_id, created_at desc);

-- outlines
create table outlines (
  id          uuid primary key default gen_random_uuid(),
  video_id    uuid not null references videos(id) on delete cascade unique,
  sections    jsonb not null,
  model_used  text not null,
  created_at  timestamptz not null default now()
);

-- decks
create table decks (
  id         uuid primary key default gen_random_uuid(),
  video_id   uuid not null references videos(id) on delete cascade unique,
  user_id    uuid not null references profiles(id) on delete cascade,
  name       text not null,
  style      text not null default 'quick' check (style in ('quick','exam','deep','language')),
  created_at timestamptz not null default now()
);

-- cards
create table cards (
  id          uuid primary key default gen_random_uuid(),
  deck_id     uuid not null references decks(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  type        text not null check (type in ('basic','cloze')),
  front       text not null,
  back        text not null,
  source_ts_s int,
  fsrs_state  jsonb not null,
  due_at      timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index cards_due_idx on cards (user_id, due_at);
create index cards_deck_idx on cards (deck_id);

-- review_log
create table review_log (
  id          uuid primary key default gen_random_uuid(),
  card_id     uuid not null references cards(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  rating      smallint not null check (rating between 1 and 4),
  elapsed_ms  int not null,
  reviewed_at timestamptz not null default now()
);

create index review_log_user_idx on review_log (user_id, reviewed_at desc);
