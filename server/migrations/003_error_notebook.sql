create table if not exists error_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  subject_id uuid references subjects(id) on delete set null,
  topic_id uuid references topics(id) on delete set null,
  subject_name text not null default '',
  subsubject text not null default '',
  topic_name text not null default '',
  statement text not null check (char_length(trim(statement)) between 1 and 50000),
  alternatives jsonb not null default '[]'::jsonb,
  selected_answer text not null default '',
  correct_answer text not null default '',
  personal_comment text not null default '',
  reasoning text not null default '',
  confidence integer not null default 3 check (confidence between 1 and 5),
  difficulty text not null default 'medium'
    check (difficulty in ('easy','medium','hard')),
  question_type text not null default 'multiple_choice'
    check (question_type in ('true_false','multiple_choice','discursive')),
  board text not null default '',
  exam text not null default '',
  year integer,
  source text not null default '',
  tags text[] not null default '{}',
  status text not null default 'pending'
    check (status in ('pending','reviewing','corrected','mastered')),
  recurrence_count integer not null default 1,
  is_recurring boolean not null default false,
  corrected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists error_analyses (
  id uuid primary key default gen_random_uuid(),
  error_id uuid not null unique references error_records(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  primary_error_type text,
  secondary_error_types text[] not null default '{}',
  content text not null,
  plan jsonb not null default '[]'::jsonb,
  is_inconclusive boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists correction_plan_steps (
  id uuid primary key default gen_random_uuid(),
  error_id uuid not null references error_records(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  position integer not null default 1,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists reinforcement_sessions (
  id uuid primary key default gen_random_uuid(),
  error_id uuid not null references error_records(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  format text not null default 'multiple_choice',
  difficulty text not null default 'progressive',
  status text not null default 'active'
    check (status in ('active','completed')),
  created_at timestamptz not null default now()
);

create table if not exists reinforcement_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references reinforcement_sessions(id) on delete cascade,
  error_id uuid not null references error_records(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  position integer not null,
  question text not null,
  alternatives jsonb not null default '[]'::jsonb,
  correct_answer text not null,
  student_answer text not null default '',
  is_correct boolean,
  explanation text not null default '',
  answered_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_error_records_user_updated on error_records(user_id, updated_at desc);
create index if not exists idx_error_records_subject on error_records(user_id, subject_name);
create index if not exists idx_error_records_status on error_records(user_id, status);
create index if not exists idx_error_analyses_error on error_analyses(error_id);
