# PolíciaStudy AI

Fundação da Fase 1 com React, TypeScript, Vite, Tailwind CSS, React Router, Node.js e PostgreSQL local.

## Requisitos

- Node.js
- PostgreSQL instalado e em execução

## Configuração

```bash
npm install
copy .env.example .env
```

Configure no `.env`:

```text
PORT=3001
DATABASE_URL=postgresql://postgres:senha@localhost:5432/policiastudy
JWT_SECRET=um-segredo-longo-com-pelo-menos-32-caracteres
```

Crie o banco `policiastudy` e execute `server/migrations/001_phase1.sql` pelo pgAdmin ou psql.

```bash
npm run dev
```

- Interface: `http://localhost:5173`
- API: `http://localhost:3001`

## Segurança

As senhas são armazenadas com bcrypt. A sessão usa cookie HTTP-only firmado com JWT. Todas as consultas de dados são filtradas pelo usuário autenticado no servidor.

## Verificações

```bash
npm run build
npm run lint
```
