import { useEffect, useState, type FormEvent } from 'react'
import { Copy, Plus, Search, Trash2, X } from 'lucide-react'
import { api } from '../lib/api'
import './LearningPages.css'

interface Deck { id:string; name:string; description:string; card_count:number; due_count:number }
interface Card {
  id:string; deck_id:string|null; deck_name?:string; question:string; answer:string;
  subject_name:string; topic_name:string; tags:string[]; difficulty:'easy'|'medium'|'hard';
  mastery_level:number; next_review_at:string; favorite:boolean;
}

export function Flashcards() {
  const [decks,setDecks]=useState<Deck[]>([])
  const [cards,setCards]=useState<Card[]>([])
  const [search,setSearch]=useState('')
  const [deckId,setDeckId]=useState('all')
  const [modal,setModal]=useState(false)
  const [study,setStudy]=useState<Card[]>([])
  const [studyIndex,setStudyIndex]=useState(0)
  const [revealed,setRevealed]=useState(false)
  const [sessionStats,setSessionStats]=useState({good:0,hard:0,unknown:0,easy:0})
  const [loading,setLoading]=useState(true)
  const [generating,setGenerating]=useState(false)
  const [error,setError]=useState('')
  const [form,setForm]=useState({question:'',answer:'',deckId:'',subjectName:'',topicName:'',tags:'',difficulty:'medium',observation:''})

  const load=async()=>{
    setLoading(true)
    try {
      const [deckData,cardData]=await Promise.all([
        api<{decks:Deck[]}>('/decks'),
        api<{flashcards:Card[]}>(`/flashcards${search?`?search=${encodeURIComponent(search)}`:''}${deckId!=='all'?`${search?'&':'?'}deckId=${deckId}`:''}`),
      ])
      setDecks(deckData.decks);setCards(cardData.flashcards)
    } catch(loadError){setError(loadError instanceof Error?loadError.message:'Não foi possível carregar.')}
    finally{setLoading(false)}
  }
  useEffect(()=>{load()},[])

  const createDeck=async()=>{
    const name=window.prompt('Nome do baralho')
    if(!name?.trim())return
    try{await api('/decks',{method:'POST',body:JSON.stringify({name:name.trim()})});await load()}
    catch(saveError){setError(saveError instanceof Error?saveError.message:'Não foi possível criar o baralho.')}
  }

  const submit=async(event:FormEvent)=>{
    event.preventDefault()
    try{
      await api('/flashcards',{method:'POST',body:JSON.stringify({
        question:form.question,answer:form.answer,deckId:form.deckId||null,
        subjectName:form.subjectName,topicName:form.topicName,
        tags:form.tags.split(',').map(tag=>tag.trim()).filter(Boolean),
        difficulty:form.difficulty,observation:form.observation,
      })})
      setModal(false);setForm({question:'',answer:'',deckId:'',subjectName:'',topicName:'',tags:'',difficulty:'medium',observation:''});await load()
    }catch(saveError){setError(saveError instanceof Error?saveError.message:'Não foi possível salvar.')}
  }

  const remove=async(card:Card)=>{
    if(!window.confirm('Excluir este flashcard?'))return
    await api(`/flashcards/${card.id}`,{method:'DELETE'});await load()
  }
  const duplicate=async(card:Card)=>{
    await api(`/flashcards/${card.id}/duplicate`,{method:'POST'});await load()
  }

  const generate=async()=>{
    const content=window.prompt('Informe o assunto ou cole o texto para gerar flashcards')
    if(!content?.trim())return
    setGenerating(true);setError('')
    try{
      const data=await api<{cards:Array<{question:string;answer:string;subjectName?:string;topicName?:string;tags?:string[]}>}>('/flashcards/generate',{method:'POST',body:JSON.stringify({content:content.trim(),count:5,difficulty:'medium'})})
      for(const card of data.cards){
        await api('/flashcards',{method:'POST',body:JSON.stringify({question:card.question,answer:card.answer,subjectName:card.subjectName||'',topicName:card.topicName||'',tags:card.tags||[],difficulty:'medium'})})
      }
      await load()
    }catch(generateError){setError(generateError instanceof Error?generateError.message:'Não foi possível gerar os flashcards.')}
    finally{setGenerating(false)}
  }

  const startStudy=()=>{
    const due=cards.filter(card=>new Date(card.next_review_at)<=new Date())
    setStudy(due.length?due.slice(0,25):cards.slice(0,25))
    setStudyIndex(0);setRevealed(false);setSessionStats({good:0,hard:0,unknown:0,easy:0})
  }
  const review=async(rating:'unknown'|'hard'|'good'|'easy')=>{
    const card=study[studyIndex]
    if(!card)return
    await api(`/flashcards/${card.id}/review`,{method:'POST',body:JSON.stringify({rating})})
    setSessionStats(previous=>({...previous,[rating]:previous[rating]+1}))
    setRevealed(false)
    if(studyIndex+1<study.length)setStudyIndex(studyIndex+1)
    else await load()
  }

  return (
    <div className="learning-page">
      <header className="learning-header"><div><p className="eyebrow">Memorização</p><h1>Flashcards</h1></div><div className="header-actions"><button className="button secondary" disabled={generating} onClick={generate}>{generating?'Gerando...':'Gerar com IA'}</button><button className="button primary" onClick={()=>setModal(true)}><Plus size={18}/>Novo cartão</button></div></header>
      {error&&<div className="alert error">{error}</div>}
      {study.length>0&&studyIndex<study.length?(
        <section className="study-panel">
          <div className="study-top"><strong>{studyIndex+1} de {study.length}</strong><button className="icon-button" onClick={()=>setStudy([])} aria-label="Encerrar estudo"><X size={18}/></button></div>
          <div className="study-progress"><span style={{width:`${((studyIndex+1)/study.length)*100}%`}}/></div>
          <article className={`study-card ${revealed?'revealed':''}`}><p>{revealed?'Resposta':'Pergunta'}</p><h2>{revealed?study[studyIndex].answer:study[studyIndex].question}</h2></article>
          {!revealed?<button className="button primary reveal-button" onClick={()=>setRevealed(true)}>Revelar resposta</button>:<div className="rating-grid"><button onClick={()=>review('unknown')}>Não sabia</button><button onClick={()=>review('hard')}>Difícil</button><button onClick={()=>review('good')}>Bom</button><button onClick={()=>review('easy')}>Fácil</button></div>}
        </section>
      ):(
        <>
          {study.length>0&&<section className="session-summary"><h2>Sessão concluída</h2><p>{sessionStats.good+sessionStats.easy} boas respostas · {sessionStats.hard} difíceis · {sessionStats.unknown} não sabidas</p><button className="button secondary" onClick={()=>setStudy([])}>Fechar</button></section>}
          <div className="learning-tools"><label className="learning-search"><Search size={17}/><input value={search} onChange={event=>setSearch(event.target.value)} onBlur={load} placeholder="Pesquisar cartões"/></label><select value={deckId} onChange={event=>{setDeckId(event.target.value)}} onBlur={load}><option value="all">Todos os baralhos</option>{decks.map(deck=><option key={deck.id} value={deck.id}>{deck.name}</option>)}</select><button className="button secondary" onClick={createDeck}>Novo baralho</button><button className="button primary" onClick={startStudy} disabled={!cards.length}>Começar estudo</button></div>
          {loading?<div className="app-loading"><span className="spinner"/>Carregando cards...</div>:(
            <div className="deck-grid">{decks.map(deck=><article className="deck-card" key={deck.id}><p>{deck.card_count} cartões</p><h2>{deck.name}</h2><span>{deck.due_count} para revisar</span></article>)}</div>
          )}
          <section className="card-list">{cards.map(card=><article className="learning-card" key={card.id}><div><p className="eyebrow">{card.subject_name||card.deck_name||'Baralho geral'} · {card.topic_name}</p><h2>{card.question}</h2></div><p className="card-answer">{card.answer}</p><div className="card-footer"><span>Nível {card.mastery_level}/5</span><button className="icon-button" onClick={()=>duplicate(card)} aria-label="Duplicar"><Copy size={16}/></button><button className="icon-button danger" onClick={()=>remove(card)} aria-label="Excluir"><Trash2 size={16}/></button></div></article>)}</section>
        </>
      )}
      {modal&&<div className="modal-backdrop"><div className="learning-modal"><div className="modal-header"><h2>Novo flashcard</h2><button className="icon-button" onClick={()=>setModal(false)}><X size={18}/></button></div><form onSubmit={submit}><label className="field span-2"><span>Pergunta</span><textarea className="form-control" rows={3} value={form.question} onChange={event=>setForm({...form,question:event.target.value})} required/></label><label className="field span-2"><span>Resposta</span><textarea className="form-control" rows={4} value={form.answer} onChange={event=>setForm({...form,answer:event.target.value})} required/></label><label className="field"><span>Baralho</span><select className="form-control" value={form.deckId} onChange={event=>setForm({...form,deckId:event.target.value})}><option value="">Sem baralho</option>{decks.map(deck=><option key={deck.id} value={deck.id}>{deck.name}</option>)}</select></label><label className="field"><span>Dificuldade</span><select className="form-control" value={form.difficulty} onChange={event=>setForm({...form,difficulty:event.target.value})}><option value="easy">Fácil</option><option value="medium">Média</option><option value="hard">Difícil</option></select></label><label className="field"><span>Disciplina</span><input className="form-control" value={form.subjectName} onChange={event=>setForm({...form,subjectName:event.target.value})}/></label><label className="field"><span>Assunto</span><input className="form-control" value={form.topicName} onChange={event=>setForm({...form,topicName:event.target.value})}/></label><label className="field span-2"><span>Tags</span><input className="form-control" value={form.tags} onChange={event=>setForm({...form,tags:event.target.value})}/></label><div className="modal-actions span-2"><button type="button" className="button secondary" onClick={()=>setModal(false)}>Cancelar</button><button className="button primary">Salvar cartão</button></div></form></div></div>}
    </div>
  )
}
