create table if not exists flashcard_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  description text not null default '',
  color text not null default '#3157a5',
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  deck_id uuid references flashcard_decks(id) on delete set null,
  question text not null,
  answer text not null,
  subject_name text not null default '',
  topic_name text not null default '',
  subsubject text not null default '',
  tags text[] not null default '{}',
  difficulty text not null default 'medium' check (difficulty in ('easy','medium','hard')),
  source text not null default '',
  observation text not null default '',
  origin_type text not null default 'manual',
  origin_id uuid,
  favorite boolean not null default false,
  easiness double precision not null default 2.5,
  interval_days integer not null default 0,
  repetitions integer not null default 0,
  lapses integer not null default 0,
  mastery_level integer not null default 0 check (mastery_level between 0 and 5),
  last_reviewed_at timestamptz,
  next_review_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists flashcard_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  flashcard_id uuid not null references flashcards(id) on delete cascade,
  rating text not null check (rating in ('unknown','hard','good','easy')),
  response_time_seconds integer,
  previous_interval integer not null,
  new_interval integer not null,
  previous_mastery integer not null,
  new_mastery integer not null,
  next_review_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists review_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  session_type text not null check (session_type in ('quick','normal','deep')),
  status text not null default 'active' check (status in ('active','completed')),
  cards_reviewed integer not null default 0,
  correct_count integer not null default 0,
  difficulty_count integer not null default 0,
  unknown_count integer not null default 0,
  elapsed_seconds integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists mind_maps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  description text not null default '',
  subject_name text not null default '',
  topic_name text not null default '',
  tags text[] not null default '{}',
  source text not null default '',
  origin_type text not null default 'manual',
  origin_id uuid,
  data jsonb not null default '{"nodes":[],"connections":[]}'::jsonb,
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  summary_type text not null default 'complete',
  size text not null default 'medium',
  subject_name text not null default '',
  topic_name text not null default '',
  content text not null default '',
  tags text[] not null default '{}',
  source text not null default '',
  origin_type text not null default 'manual',
  origin_id uuid,
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists learning_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  generation_type text not null,
  provider text not null,
  model text not null,
  status text not null check (status in ('success','error','limit')),
  estimated_tokens integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_flashcards_user_review on flashcards(user_id,next_review_at);
create index if not exists idx_flashcards_deck on flashcards(deck_id);
create index if not exists idx_flashcard_reviews_card on flashcard_reviews(flashcard_id,created_at desc);
create index if not exists idx_mind_maps_user on mind_maps(user_id,updated_at desc);
create index if not exists idx_summaries_user on summaries(user_id,updated_at desc);
