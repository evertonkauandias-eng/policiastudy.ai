import { useEffect, useState } from 'react'
import { Plus, Search, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import './LearningPages.css'

interface MapNode { id:string; label:string; parentId:string|null; color?:string }
interface MindMap { id:string; title:string; subject_name:string; topic_name:string; data:{nodes:MapNode[];connections?:any[]} }

export function MindMaps() {
  const [maps,setMaps]=useState<MindMap[]>([])
  const [selected,setSelected]=useState<MindMap|null>(null)
  const [search,setSearch]=useState('')
  const [error,setError]=useState('')
  const [generating,setGenerating]=useState(false)
  const load=async()=>{
    try{const data=await api<{maps:MindMap[]}>(`/mind-maps${search?`?search=${encodeURIComponent(search)}`:''}`);setMaps(data.maps)}catch(loadError){setError(loadError instanceof Error?loadError.message:'Não foi possível carregar.')}
  }
  useEffect(()=>{load()},[])

  const create=async()=>{
    const title=window.prompt('Título do mapa mental')
    if(!title?.trim())return
    try{const data=await api<{map:MindMap}>('/mind-maps',{method:'POST',body:JSON.stringify({title:title.trim()})});await load();setSelected(data.map)}
    catch(createError){setError(createError instanceof Error?createError.message:'Não foi possível criar.')}
  }
  const generate=async()=>{
    const content=window.prompt('Informe o assunto ou cole o conteúdo')
    if(!content?.trim())return
    setGenerating(true);setError('')
    try{const data=await api<{map:MindMap}>('/mind-maps/generate',{method:'POST',body:JSON.stringify({content:content.trim()})});await load();setSelected(data.map)}
    catch(generateError){setError(generateError instanceof Error?generateError.message:'Não foi possível gerar o mapa.')}
    finally{setGenerating(false)}
  }
  const addNode=()=>{
    if(!selected)return
    const label=window.prompt('Nome do novo conceito')
    if(!label?.trim())return
    const nodes=[...(selected.data.nodes||[])]
    nodes.push({id:`node-${Date.now()}`,label:label.trim(),parentId:nodes[0]?.id||null,color:'#7356a8'})
    const updated={...selected,data:{...selected.data,nodes}}
    setSelected(updated)
  }
  const editNode=(node:MapNode)=>{
    if(!selected)return
    const label=window.prompt('Editar conceito',node.label)?.trim()
    if(!label)return
    const nodes=selected.data.nodes.map(item=>item.id===node.id?{...item,label}:item)
    setSelected({...selected,data:{...selected.data,nodes}})
  }
  const removeNode=(node:MapNode)=>{
    if(!selected||node.parentId===null)return
    if(!window.confirm('Excluir este conceito e seus nós filhos?'))return
    const removeIds=new Set<string>([node.id])
    let changed=true
    while(changed){changed=false;selected.data.nodes.forEach(item=>{if(item.parentId&&removeIds.has(item.parentId)&&!removeIds.has(item.id)){removeIds.add(item.id);changed=true}})}
    setSelected({...selected,data:{...selected.data,nodes:selected.data.nodes.filter(item=>!removeIds.has(item.id))}})
  }
  const save=async()=>{
    if(!selected)return
    try{await api(`/mind-maps/${selected.id}`,{method:'PUT',body:JSON.stringify({title:selected.title,data:selected.data})});await load()}
    catch(saveError){setError(saveError instanceof Error?saveError.message:'Não foi possível salvar.')}
  }
  const removeMap=async(map:MindMap)=>{
    if(!window.confirm('Excluir este mapa mental?'))return
    await api(`/mind-maps/${map.id}`,{method:'DELETE'})
    if(selected?.id===map.id)setSelected(null);await load()
  }
  const roots=(selected?.data.nodes||[]).filter(node=>node.parentId===null)
  const children=(parentId:string)=>(selected?.data.nodes||[]).filter(node=>node.parentId===parentId)

  return (
    <div className="learning-page">
      <header className="learning-header"><div><p className="eyebrow">Organização visual</p><h1>Mapas mentais</h1></div><div className="header-actions"><button className="button secondary" disabled={generating} onClick={generate}>{generating?'Gerando...':'Gerar com IA'}</button><button className="button primary" onClick={create}><Plus size={18}/>Novo mapa</button></div></header>
      {error&&<div className="alert error">{error}</div>}
      <div className="learning-tools"><label className="learning-search"><Search size={17}/><input value={search} onChange={event=>setSearch(event.target.value)} onBlur={load} placeholder="Pesquisar mapas"/></label></div>
      <div className="learning-layout">
        <aside className="learning-list">{maps.map(map=><button className={`learning-list-item ${selected?.id===map.id?'active':''}`} key={map.id} onClick={()=>setSelected(map)}><span><strong>{map.title}</strong><small>{map.subject_name||'Sem disciplina'} · {map.topic_name||'Sem assunto'}</small></span><Trash2 size={15} onClick={event=>{event.stopPropagation();removeMap(map)}}/></button>)}</aside>
        {selected?<section className="mindmap-canvas">
          <div className="mindmap-toolbar"><input value={selected.title} onChange={event=>setSelected({...selected,title:event.target.value})}/><button className="button primary" onClick={save}>Salvar</button><button className="button secondary" onClick={addNode}>Adicionar nó</button></div>
          <div className="mindmap-tree">{roots.map(root=><MindBranch key={root.id} node={root} children={children} editNode={editNode} removeNode={removeNode}/>)}</div>
        </section>:<div className="learning-empty"><h2>Selecione ou crie um mapa</h2><p>Os conceitos serão organizados em uma estrutura persistida.</p></div>}
      </div>
    </div>
  )
}

function MindBranch({node,children,editNode,removeNode}:{node:MapNode;children:(id:string)=>MapNode[];editNode:(node:MapNode)=>void;removeNode:(node:MapNode)=>void}) {
  const branches=children(node.id)
  return <div className="mind-branch"><button className="mind-node" style={{borderColor:node.color||'#3157a5'}} onClick={()=>editNode(node)} onContextMenu={event=>{event.preventDefault();removeNode(node)}}>{node.label}</button>{branches.length>0&&<div className="mind-children">{branches.map(branch=><MindBranch key={branch.id} node={branch} children={children} editNode={editNode} removeNode={removeNode}/>)}</div>}</div>
}
