# Hospedagem e atualização

O projeto pode ser publicado no Render com PostgreSQL gerenciado.

## Preparação

1. Envie o projeto para um repositório GitHub privado.
2. No Render, escolha **New > Blueprint** e selecione o repositório.
3. Confirme PostgreSQL e Web Service.
4. Configure `APP_URL` com a URL pública exibida pelo Render.
5. Configure `AI_API_KEY` com uma chave válida para o provedor escolhido.
6. Aguarde o primeiro build e migration.

Nunca coloque `AI_API_KEY`, `JWT_SECRET` ou a senha do banco no Git.

## Provedor de IA

- Padrão do Render: OpenAI-compatible.
- Configure `AI_BASE_URL=https://api.openai.com/v1`.
- Configure `AI_MODEL=gpt-4o-mini`.
- Configure `AI_API_KEY`.
- Para outro provedor compatible, altere base URL, modelo e chave.

O uso da API de IA pode gerar cobranças conforme o provedor.

## Atualizações futuras

```bash
git add .
git commit -m "Nova atualização"
git push
```

O Render detectará o push e fará build, migration e deploy automaticamente.
