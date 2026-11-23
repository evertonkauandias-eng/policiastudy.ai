import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Bot, Menu, MessageSquarePlus, Pencil, Plus, Send, Trash2, X } from 'lucide-react'
import { api } from '../lib/api'
import './ProfessorIA.css'

type TeachingMode = 'simple' | 'deep' | 'exam' | 'interrogation' | 'quick_review'

interface Conversation {
  id: string
  title: string
  teaching_mode: TeachingMode
  updated_at: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

const modes: Array<{ value: TeachingMode; label: string }> = [
  { value: 'simple', label: 'Modo simples' },
  { value: 'deep', label: 'Aprofundado' },
  { value: 'exam', label: 'Modo concurso' },
  { value: 'interrogation', label: 'Interrogatório' },
  { value: 'quick_review', label: 'Revisão rápida' },
]

const starters = [
  { label: 'Explique um assunto', prompt: 'Explique um assunto importante de concurso de forma simples.' },
  { label: 'Tire uma dúvida', prompt: 'Tenho uma dúvida sobre um assunto. Vou informar qual é.' },
  { label: 'Me faça perguntas', prompt: 'Me faça perguntas de fixação e aguarde minhas respostas.' },
  { label: 'Crie questões', prompt: 'Crie 5 questões autorais de múltipla escolha sobre um assunto de concurso.' },
  { label: 'Faça uma revisão rápida', prompt: 'Faça uma revisão rápida de um assunto importante para concurso.' },
]

export function ProfessorIA() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [mode, setMode] = useState<TeachingMode>('simple')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [error, setError] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const loadConversations = async () => {
    const data = await api<{ conversations: Conversation[] }>('/conversations')
    setConversations(data.conversations)
  }

  useEffect(() => {
    loadConversations().finally(() => setLoadingHistory(false))
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const openConversation = async (item: Conversation) => {
    setError('')
    setSidebarOpen(false)
    setLoadingHistory(true)
    try {
      const data = await api<{ conversation: Conversation; messages: Message[] }>(`/conversations/${item.id}`)
      setConversation(data.conversation)
      setMode(data.conversation.teaching_mode)
      setMessages(data.messages)
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Não foi possível abrir a conversa.')
    } finally {
      setLoadingHistory(false)
    }
  }

  const createConversation = async (selectedMode: TeachingMode = mode) => {
    setError('')
    try {
      const data = await api<{ conversation: Conversation }>('/conversations', {
        method: 'POST',
        body: JSON.stringify({ title: 'Nova conversa', teachingMode: selectedMode }),
      })
      setConversations(previous => [data.conversation, ...previous])
      setConversation(data.conversation)
      setMode(selectedMode)
      setMessages([])
      setSidebarOpen(false)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Não foi possível criar a conversa.')
    }
  }

  const changeMode = async (value: TeachingMode) => {
    setMode(value)
    if (!conversation) return
    try {
      const data = await api<{ conversation: Conversation }>(`/conversations/${conversation.id}`, {
        method: 'PUT',
        body: JSON.stringify({ teachingMode: value }),
      })
      setConversation(data.conversation)
      setConversations(previous => previous.map(item => item.id === data.conversation.id ? data.conversation : item))
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : 'Não foi possível alterar o modo.')
    }
  }

  const renameConversation = async (item: Conversation) => {
    const title = window.prompt('Nome da conversa', item.title)?.trim()
    if (!title) return
    try {
      const data = await api<{ conversation: Conversation }>(`/conversations/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({ title }),
      })
      setConversations(previous => previous.map(existing => existing.id === item.id ? data.conversation : existing))
      if (conversation?.id === item.id) setConversation(data.conversation)
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : 'Não foi possível renomear.')
    }
  }

  const deleteConversation = async (item: Conversation) => {
    if (!window.confirm(`Excluir a conversa "${item.title}"?`)) return
    await api(`/conversations/${item.id}`, { method: 'DELETE' })
    setConversations(previous => previous.filter(existing => existing.id !== item.id))
    if (conversation?.id === item.id) {
      setConversation(null)
      setMessages([])
    }
  }

  const sendMessage = async (content = input) => {
    const trimmed = content.trim()
    if (!trimmed || loading) return
    setError('')
    let active = conversation
    if (!active) {
      try {
        const data = await api<{ conversation: Conversation }>('/conversations', {
          method: 'POST',
          body: JSON.stringify({ title: trimmed.slice(0, 80), teachingMode: mode }),
        })
        active = data.conversation
        setConversation(data.conversation)
        setConversations(previous => [data.conversation, ...previous])
      } catch (createError) {
        setError(createError instanceof Error ? createError.message : 'Não foi possível iniciar a conversa.')
        return
      }
    }
    setInput('')
    setLoading(true)
    setMessages(previous => [...previous, {
      id: `local-${Date.now()}`,
      role: 'user',
      content: trimmed,
      created_at: new Date().toISOString(),
    }])
    try {
      const data = await api<{ assistantMessage: Message }>(`/conversations/${active.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: trimmed }),
      })
      setMessages(previous => [...previous, data.assistantMessage])
      await loadConversations()
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Não foi possível gerar a resposta.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    sendMessage()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="professor-page">
      <aside className={`conversation-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="conversation-sidebar-header">
          <h2>Conversas</h2>
          <button className="icon-button conversation-close" onClick={() => setSidebarOpen(false)} aria-label="Fechar conversas"><X size={19} /></button>
        </div>
        <button className="button primary new-conversation" onClick={() => createConversation()}><Plus size={18} />Nova conversa</button>
        <div className="conversation-search">
          {loadingHistory ? <p>Carregando...</p> : conversations.length === 0 ? (
            <p className="conversation-empty">Nenhuma conversa criada.</p>
          ) : conversations.map(item => (
            <div className={`conversation-item ${conversation?.id === item.id ? 'active' : ''}`} key={item.id}>
              <button className="conversation-open" onClick={() => openConversation(item)}><MessageSquarePlus size={16} /><span>{item.title}</span></button>
              <button className="icon-button" onClick={() => renameConversation(item)} aria-label="Renomear conversa"><Pencil size={14} /></button>
              <button className="icon-button danger" onClick={() => deleteConversation(item)} aria-label="Excluir conversa"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </aside>
      {sidebarOpen && <button className="conversation-overlay" onClick={() => setSidebarOpen(false)} aria-label="Fechar conversas" />}
      <section className="chat-area">
        <header className="chat-header">
          <button className="icon-button conversation-menu" onClick={() => setSidebarOpen(true)} aria-label="Abrir conversas"><Menu size={20} /></button>
          <div className="chat-title"><span className="professor-avatar"><Bot size={18} /></span><div><h1>Professor IA</h1><p>{conversation?.title || 'Nova conversa'}</p></div></div>
          <label className="mode-select"><span>Modo</span><select value={mode} onChange={event => changeMode(event.target.value as TeachingMode)}>
            {modes.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select></label>
        </header>
        <div className="chat-scroll">
          {messages.length === 0 ? (
            <div className="chat-welcome">
              <span className="welcome-avatar"><Bot size={27} /></span>
              <h2>Olá! Sou seu Professor IA.</h2>
              <p>Posso explicar qualquer assunto de concurso de forma simples, aprofundar conteúdos, criar questões e testar seu conhecimento.</p>
              <p className="welcome-question">O que você quer aprender hoje?</p>
              <div className="starter-grid">
                {starters.map(starter => <button key={starter.label} onClick={() => sendMessage(starter.prompt)}>{starter.label}</button>)}
              </div>
            </div>
          ) : (
            <div className="message-list">
              {messages.map(message => (
                <article className={`chat-message ${message.role}`} key={message.id}>
                  {message.role === 'assistant' && <span className="message-avatar"><Bot size={16} /></span>}
                  <div className="message-bubble">
                    {message.role === 'assistant' ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                    ) : <p>{message.content}</p>}
                  </div>
                </article>
              ))}
              {loading && <article className="chat-message assistant"><span className="message-avatar"><Bot size={16} /></span><div className="message-bubble typing"><span /><span /><span /></div></article>}
              <div ref={endRef} />
            </div>
          )}
        </div>
        {error && <div className="chat-error" role="alert">{error}</div>}
        <form className="chat-composer" onSubmit={handleSubmit}>
          <textarea value={input} onChange={event => setInput(event.target.value)} onKeyDown={handleKeyDown} rows={1} placeholder="Digite sua dúvida ou responda à questão..." maxLength={5000} disabled={loading} />
          <button className="send-button" type="submit" disabled={loading || !input.trim()} aria-label="Enviar mensagem"><Send size={18} /></button>
        </form>
      </section>
    </div>
  )
}
