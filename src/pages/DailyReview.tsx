import { useEffect, useState } from 'react'
import { AlertTriangle, Clock3, RotateCcw, Target } from 'lucide-react'
import { api } from '../lib/api'
import './LearningPages.css'

interface ReviewCard { id:string; question:string; answer:string; subject_name:string; topic_name:string; mastery_level:number }

export function DailyReview() {
  const [dashboard,setDashboard]=useState({overdue:0,today:0,upcoming:0,learning:0,mastered:0,total:0})
  const [session,setSession]=useState<{id:string}|null>(null)
  const [cards,setCards]=useState<ReviewCard[]>([])
  const [index,setIndex]=useState(0)
  const [revealed,setRevealed]=useState(false)
  const [stats,setStats]=useState({cards:0,correct:0,difficulties:0,unknown:0})
  const [error,setError]=useState('')

  const load=async()=>{
    try{const data=await api<{dashboard:typeof dashboard}>('/review/dashboard');setDashboard(data.dashboard)}
    catch(loadError){setError(loadError instanceof Error?loadError.message:'Não foi possível carregar.')}
  }
  useEffect(()=>{load()},[])

  const start=async(type:'quick'|'normal'|'deep')=>{
    setError('')
    try{
      const data=await api<{session:{id:string};cards:ReviewCard[]}>('/review-sessions',{method:'POST',body:JSON.stringify({sessionType:type})})
      setSession(data.session);setCards(data.cards);setIndex(0);setRevealed(false);setStats({cards:0,correct:0,difficulties:0,unknown:0})
    }catch(startError){setError(startError instanceof Error?startError.message:'Não foi possível iniciar.')}
  }
  const review=async(rating:'unknown'|'hard'|'good'|'easy')=>{
    if(!cards[index])return
    await api(`/flashcards/${cards[index].id}/review`,{method:'POST',body:JSON.stringify({rating})})
    setStats(previous=>({...previous,cards:previous.cards+1,correct:previous.correct+(rating==='good'||rating==='easy'?1:0),difficulties:previous.difficulties+(rating==='hard'?1:0),unknown:previous.unknown+(rating==='unknown'?1:0)}))
    setRevealed(false)
    if(index+1<cards.length)setIndex(index+1)
  }
  const finish=async()=>{
    if(!session)return
    await api(`/review-sessions/${session.id}`,{method:'PUT',body:JSON.stringify({cardsReviewed:stats.cards,correctCount:stats.correct,difficultyCount:stats.difficulties,unknownCount:stats.unknown})})
    setSession(null);setCards([]);await load()
  }

  return (
    <div className="learning-page">
      <header className="learning-header"><div><p className="eyebrow">Prioridades reais</p><h1>Revisão de hoje</h1></div></header>
      {error&&<div className="alert error">{error}</div>}
      {cards.length>0&&index<cards.length?(
        <section className="study-panel">
          <div className="study-top"><strong>{index+1} de {cards.length}</strong><button className="button secondary" onClick={finish}>Encerrar sessão</button></div>
          <article className={`study-card ${revealed?'revealed':''}`}><p>{revealed?'Resposta':'Pergunta prioritária'}</p><h2>{revealed?cards[index].answer:cards[index].question}</h2></article>
          {!revealed?<button className="button primary reveal-button" onClick={()=>setRevealed(true)}>Revelar resposta</button>:<div className="rating-grid"><button onClick={()=>review('unknown')}>Não sabia</button><button onClick={()=>review('hard')}>Difícil</button><button onClick={()=>review('good')}>Bom</button><button onClick={()=>review('easy')}>Fácil</button></div>}
          {index+1===cards.length&&revealed&&<button className="button primary finish-button" onClick={finish}>Finalizar revisão</button>}
        </section>
      ):(
        <>
          <section className="review-metrics"><article><Clock3 size={20}/><div><p>Atrasados</p><strong>{dashboard.overdue}</strong></div></article><article><Target size={20}/><div><p>Para hoje</p><strong>{dashboard.today}</strong></div></article><article><RotateCcw size={20}/><div><p>Em aprendizado</p><strong>{dashboard.learning}</strong></div></article><article><AlertTriangle size={20}/><div><p>Dominados</p><strong>{dashboard.mastered}</strong></div></article></section>
          <section className="review-launch"><p className="eyebrow">Sessão recomendada</p><h2>{dashboard.overdue||dashboard.today? 'Comece pelos cartões vencidos e atuais.' : 'Não há cartões vencidos no momento.'}</h2><p>{dashboard.overdue ? `${dashboard.overdue} cartões atrasados são priorizados antes dos demais.` : 'Os próximos cartões ainda não precisam ser revisados.'}</p><div className="session-options"><button onClick={()=>start('quick')} disabled={!dashboard.total}><strong>Rápida</strong><span>Até 10 cartões</span></button><button onClick={()=>start('normal')} disabled={!dashboard.total}><strong>Normal</strong><span>Até 25 cartões</span></button><button onClick={()=>start('deep')} disabled={!dashboard.total}><strong>Aprofundada</strong><span>Até 50 cartões</span></button></div></section>
          {stats.cards>0&&<section className="session-summary"><h2>Sessão finalizada</h2><p>{stats.cards} revisados · {stats.correct} boas respostas · {stats.difficulties} difíceis · {stats.unknown} não sabidas</p></section>}
        </>
      )}
    </div>
  )
}
