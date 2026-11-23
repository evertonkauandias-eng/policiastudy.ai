import type { Pool } from 'pg'

export type TeachingMode = 'simple' | 'deep' | 'exam' | 'interrogation' | 'quick_review'

const modeInstructions: Record<TeachingMode, string> = {
  simple: 'Explique no modo simples: linguagem acessível, exemplos cotidianos, partes pequenas e verificação da compreensão.',
  deep: 'Explique no modo aprofundado: conceito técnico, fundamentos, características, exceções relevantes e aplicações práticas para concursos.',
  exam: 'Explique no modo concurso: pontos cobrados, pegadinhas comuns, diferenças importantes, dica útil e uma questão autoral gerada pelo sistema.',
  interrogation: 'Conduza o modo interrogatório: faça uma pergunta por vez, aguarde a resposta, corrija o que estiver certo ou incorreto e ajuste a dificuldade.',
  quick_review: 'Use revisão rápida: conceito em uma frase, 3 a 5 pontos, uma pegadinha, um bizu e uma questão curta.',
}

export async function buildStudentContext(pool: Pool, userId: string) {
  const [profile, exam, subjects, topics] = await Promise.all([
    pool.query('select full_name,email from profiles where id=$1', [userId]),
    pool.query('select exam_name,institution,state,desired_position,examining_board,exam_date,preparation_status from user_exam_preferences where user_id=$1', [userId]),
    pool.query('select name,priority from subjects where user_id=$1 order by priority desc,name', [userId]),
    pool.query('select name,study_status from topics where user_id=$1 order by created_at', [userId]),
  ])
  return {
    profile: profile.rows[0] || null,
    exam: exam.rows[0] || null,
    subjects: subjects.rows,
    topics: topics.rows,
  }
}

export function buildSystemPrompt(context: { profile: any; exam: any; subjects: any[]; topics: any[] }, mode: TeachingMode) {
  const profileName = context.profile?.full_name?.trim()
  const exam = context.exam
  const subjects = context.subjects.map(item => item.name).join(', ')
  const topics = context.topics.slice(0, 30).map(item => item.name).join(', ')
  return `Você é o Professor IA do PolíciaStudy AI, um tutor didático para estudantes de concursos policiais.

Regras:
- Use português brasileiro, seja paciente, direto e respeitoso.
- Ensine com exemplos e verifique a compreensão.
- Não invente leis, artigos, jurisprudência, súmulas, dados oficiais ou referências.
- Identifique questões geradas como autorais e nunca como provas oficiais.
- Diferencie informação confirmada de incerta e indique conferência em fonte oficial quando necessário.
- Não revele o gabarito antes da tentativa do estudante em exercícios de fixação.
- Corrija respostas explicando o que está correto, parcialmente correto ou incorreto.
- Não exponha dados pessoais desnecessários.

Modo atual: ${modeInstructions[mode]}

Contexto do estudante:
- Nome: ${profileName || 'não informado'}
- Concurso: ${exam?.exam_name || 'não informado'}
- Instituição: ${exam?.institution || 'não informada'}
- Estado: ${exam?.state || 'não informado'}
- Cargo: ${exam?.desired_position || 'não informado'}
- Banca: ${exam?.examining_board || 'não informada'}
- Data da prova: ${exam?.exam_date || 'não informada'}
- Disciplinas cadastradas: ${subjects || 'nenhuma'}
- Assuntos cadastrados: ${topics || 'nenhum'}

Use apenas o contexto necessário. Não presuma dados não cadastrados.`
}

export interface AIProviderResult {
  content: string
  model: string
  estimatedTokens: number
}

export class AIProviderError extends Error {
  status: number
  constructor(message: string, status = 502) {
    super(message)
    this.status = status
  }
}

export async function generateWithProvider(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<AIProviderResult> {
  const provider = process.env.AI_PROVIDER || 'ollama'
  const baseUrl = (process.env.AI_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '')
  const model = process.env.AI_MODEL || 'qwen2.5:7b'
  const apiKey = process.env.AI_API_KEY
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 180000)

  try {
    if (provider === 'ollama') {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          options: { temperature: 0.7, num_predict: 1200 },
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
        }),
        signal: controller.signal,
      })
      if (!response.ok) throw new AIProviderError('O provedor de IA local está indisponível.', 503)
      const data = await response.json() as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number }
      const content = data.message?.content?.trim()
      if (!content) throw new AIProviderError('O provedor não retornou uma resposta.', 502)
      return {
        content,
        model,
        estimatedTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      }
    }

    if (!apiKey) throw new AIProviderError('A chave da API de IA não está configurada.', 503)
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: 1200,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
      }),
      signal: controller.signal,
    })
    if (!response.ok) throw new AIProviderError('O provedor de IA está indisponível ou rejeitou a solicitação.', 502)
    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { total_tokens?: number }
    }
    const content = data.choices?.[0]?.message?.content?.trim()
    if (!content) throw new AIProviderError('O provedor não retornou uma resposta.', 502)
    return {
      content,
      model,
      estimatedTokens: data.usage?.total_tokens || 0,
    }
  } catch (error) {
    if (error instanceof AIProviderError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AIProviderError('A geração excedeu o tempo limite. Tente novamente.', 504)
    }
    throw new AIProviderError('Não foi possível conectar ao provedor de IA.', 503)
  } finally {
    clearTimeout(timeout)
  }
}
