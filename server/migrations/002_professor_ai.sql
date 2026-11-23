create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  teaching_mode text not null default 'simple'
    check (teaching_mode in ('simple', 'deep', 'exam', 'interrogation', 'quick_review')),
  subject_id uuid references subjects(id) on delete set null,
  topic_id uuid references topics(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 50000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  provider text not null,
  model text not null,
  request_type text not null,
  estimated_tokens integer not null default 0,
  status text not null check (status in ('success', 'error', 'limit')),
  created_at timestamptz not null default now()
);

create index if not exists idx_conversations_user_updated
  on conversations(user_id, updated_at desc);
create index if not exists idx_chat_messages_conversation_created
  on chat_messages(conversation_id, created_at);
create index if not exists idx_ai_usage_user_created
  on ai_usage(user_id, created_at desc);
