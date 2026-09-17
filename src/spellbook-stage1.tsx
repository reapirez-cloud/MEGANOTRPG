import React from 'react';
import './spellbook-stage1.css';

const circles = [1,2,3,4,5,6,7,8,9];

export default function SpellbookStage1(){
  return <section className="mn-spellbook">
    <header className="mn-spell-slots">
      <div className="mn-title">ЯЧЕЙКИ ЗАКЛИНАНИЙ</div>
      <div className="mn-slots">{circles.map((c)=><div className={c>5?'locked':'slot'} key={c}><span>☼</span><small>{c<=5?'0/0':`${c} круг`}</small></div>)}</div>
    </header>
    <section className="mn-spell-panel">
      <div className="mn-panel-title">Заговоры <small>Всегда доступны</small></div>
      <div className="mn-spell-row"><div>✦ Священный огонь</div><div>✦ Свет</div><button>+1</button></div>
    </section>
    {[1,2,3].map(level=><section className="mn-spell-panel" key={level}>
      <div className="mn-panel-title"><b>{level}</b> круг <small>0/0 ячеек</small></div>
      <div className="mn-grid"><div>✦ Заклинание</div><div>✦ Заклинание</div><div>✦ Заклинание</div></div>
    </section>)}
  </section>
}
