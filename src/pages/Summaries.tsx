import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Plus, Search, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import './LearningPages.css'

interface Summary { id:string; title:string; summary_type:string; size:string; subject_name:string; topic_name:string; content:string; favorite:boolean }

export function Summaries() {
  const [summaries,setSummaries]=useState<Summary[]>([])
  const [selected,setSelected]=useState<Summary|null>(null)
  const [search,setSearch]=useState('')
  const [content,setContent]=useState('')
  const [subject,setSubject]=useState('')
  const [topic,setTopic]=useState('')
  const [type,setType]=useState('complete')
  const [size,setSize]=useState('medium')
  const [generating,setGenerating]=useState(false)
  const [error,setError]=useState('')
  const load=async()=>{
    try{const data=await api<{summaries:Summary[]}>(`/summaries${search?`?search=${encodeURIComponent(search)}`:''}`);setSummaries(data.summaries)}catch(loadError){setError(loadError instanceof Error?loadError.message:'Não foi possível carregar.')}
  }
  useEffect(()=>{load()},[])

  const create=async()=>{
    const title=window.prompt('Título do resumo')
    if(!title?.trim())return
    try{const data=await api<{summary:Summary}>('/summaries',{method:'POST',body:JSON.stringify({title:title.trim()})});await load();setSelected(data.summary)}
    catch(createError){setError(createError instanceof Error?createError.message:'Não foi possível criar.')}
  }
  const generate=async()=>{
    if(!content.trim()){setError('Informe o tema ou conteúdo do resumo.');return}
    setGenerating(true);setError('')
    try{const data=await api<{summary:Summary}>('/summaries/generate',{method:'POST',body:JSON.stringify({content,subjectName:subject,topicName:topic,summaryType:type,size,title:'Resumo gerado'})});await load();setSelected(data.summary)}
    catch(generateError){setError(generateError instanceof Error?generateError.message:'Não foi possível gerar o resumo.')}
    finally{setGenerating(false)}
  }
  const save=async()=>{
    if(!selected)return
    try{await api(`/summaries/${selected.id}`,{method:'PUT',body:JSON.stringify({title:selected.title,content:selected.content,summaryType:selected.summary_type,size:selected.size,subjectName:selected.subject_name,topicName:selected.topic_name})});await load()}
    catch(saveError){setError(saveError instanceof Error?saveError.message:'Não foi possível salvar.')}
  }
  const remove=async(summary:Summary)=>{
    if(!window.confirm('Excluir este resumo?'))return
    await api(`/summaries/${summary.id}`,{method:'DELETE'});if(selected?.id===summary.id)setSelected(null);await load()
  }
  const toFlashcards=async()=>{
    if(!selected)return
    const contentForCards=`${selected.title}\n${selected.content}`
    try{
      const data=await api<{cards:Array<{question:string;answer:string;subjectName?:string;topicName?:string;tags?:string[]}>}>('/flashcards/generate',{method:'POST',body:JSON.stringify({content:contentForCards,count:5,difficulty:'medium'})})
      for(const card of data.cards)await api('/flashcards',{method:'POST',body:JSON.stringify({question:card.question,answer:card.answer,subjectName:card.subjectName||selected.subject_name,topicName:card.topicName||selected.topic_name,tags:card.tags||[],difficulty:'medium',originType:'summary',originId:selected.id})})
      setError('')
    }catch(convertError){setError(convertError instanceof Error?convertError.message:'Não foi possível converter.')}
  }

  return (
    <div className="learning-page">
      <header className="learning-header"><div><p className="eyebrow">Estudo organizado</p><h1>Resumos inteligentes</h1></div><button className="button primary" onClick={create}><Plus size={18}/>Novo resumo</button></header>
      {error&&<div className="alert error">{error}</div>}
      <div className="learning-tools"><label className="learning-search"><Search size={17}/><input value={search} onChange={event=>setSearch(event.target.value)} onBlur={load} placeholder="Pesquisar resumos"/></label></div>
      <section className="summary-generator"><div className="generator-grid"><label className="field span-2"><span>Tema ou texto para gerar</span><textarea className="form-control" rows={4} value={content} onChange={event=>setContent(event.target.value)} placeholder="Cole o conteúdo ou informe o tema estudado"/></label><label className="field"><span>Tipo</span><select className="form-control" value={type} onChange={event=>setType(event.target.value)}><option value="complete">Completo</option><option value="simplified">Simplificado</option><option value="exam">Para concurso</option><option value="quick">Revisão rápida</option><option value="comparative">Comparativo</option><option value="errors">Resumo de erros</option></select></label><label className="field"><span>Tamanho</span><select className="form-control" value={size} onChange={event=>setSize(event.target.value)}><option value="short">Curto</option><option value="medium">Médio</option><option value="complete">Completo</option></select></label><label className="field"><span>Disciplina</span><input className="form-control" value={subject} onChange={event=>setSubject(event.target.value)}/></label><label className="field"><span>Assunto</span><input className="form-control" value={topic} onChange={event=>setTopic(event.target.value)}/></label></div><button className="button primary" disabled={generating} onClick={generate}>{generating?'Gerando...':'Gerar resumo com IA'}</button></section>
      <div className="learning-layout summary-layout">
        <aside className="learning-list">{summaries.map(summary=><button className={`learning-list-item ${selected?.id===summary.id?'active':''}`} key={summary.id} onClick={()=>setSelected(summary)}><span><strong>{summary.title}</strong><small>{summary.subject_name||'Sem disciplina'} · {summary.topic_name||'Sem assunto'}</small></span><Trash2 size={15} onClick={event=>{event.stopPropagation();remove(summary)}}/></button>)}</aside>
        {selected?<section className="summary-editor"><div className="summary-editor-toolbar"><input value={selected.title} onChange={event=>setSelected({...selected,title:event.target.value})}/><button className="button primary" onClick={save}>Salvar</button><button className="button secondary" onClick={toFlashcards}>Criar flashcards</button></div><textarea className="markdown-editor" value={selected.content} onChange={event=>setSelected({...selected,content:event.target.value})}/><article className="markdown-preview"><ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.content}</ReactMarkdown></article></section>:<div className="learning-empty"><h2>Selecione ou gere um resumo</h2><p>O conteúdo será salvo e poderá ser convertido em cartões.</p></div>}
      </div>
    </div>
  )
}
