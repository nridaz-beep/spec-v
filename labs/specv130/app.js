(function(){
'use strict';
const bank=JSON.parse(document.getElementById('bank').textContent),core=window.SpecVLab;
core.validateBank(bank);
const KEY='specv130.review.v3.'+bank.version,$=id=>document.getElementById(id);
const map=new Map(bank.slots.map(s=>[s.id,s]));
const blockNames={trait:'性向：自然な反応・好み',mode:'モード：指定した場での行動',stress:'負荷のある場面の反応と対処',competency:'16項目：意識・意図と行動',axis:'独立5軸：原文の確認'};
const stateNames={no_opportunity:'該当場面なし',cannot_judge:'判断できない',unanswered:'未回答'};
const reasonNames={experimental_variants:'ABC同等性未検証のため集計保留',construct_review:'設問の測定対象・方向を確認中のため集計保留',missing:'必要な数値回答がそろっていないため未算出'};
let session=null,persist=false;
const answered=()=>Object.values(session.answers).filter(a=>a.status!=='unanswered').length;
const raw=item=>item.status==='answered'?String(item.raw):stateNames[item.status];
function status(message){$('status').textContent=message;}
function show(id){for(const name of ['intro','quiz','results'])$(name).hidden=name!==id;}
function text(tag,content){const el=document.createElement(tag);el.textContent=content;return el;}
function save(){if(!persist||!session)return;try{localStorage.setItem(KEY,JSON.stringify(core.validate(bank,session)));status('この端末に保存しました。');}catch{persist=false;status('保存できません。JSONを書き出して保管してください。');}}
function render(){
  show('quiz');const q=session.sequence[session.index],s=map.get(q.slotId),v=s.variants.find(v=>v.id===q.variantId),a=session.answers[s.id];
  $('demoFlag').hidden=!session.demo;$('phase').textContent=blockNames[s.block];
  $('counter').textContent=`${session.index+1} / 130問 · 回答済み ${answered()}問`;$('progress').value=answered();
  $('question').textContent=v.text;
  $('scope').textContent=s.block==='trait'?'過去半年ほどを思い浮かべ、役割や評価をいったん脇に置いたとき、自然に選びやすい反応・好みとして答えてください。':`直近1か月の「${session.context}」${s.block==='stress'?'で余裕がなかった場面':''}を思い浮かべてください。`;
  $('axisNote').hidden=s.block!=='axis';
  const labels=v.scale==='frequency'?['一度もなかった','ほとんどなかった','少なかった','半分くらい','多かった','ほとんどいつも','いつも']:['全く当てはまらない','ほとんど当てはまらない','あまり当てはまらない','どちらともいえない','やや当てはまる','かなり当てはまる','とても当てはまる'];
  $('scaleHelp').textContent=v.scale==='frequency'?'該当する場面があったときの、文面にある行動の頻度です。場面がなかった場合は「該当場面なし」を選んでください。':'文面が今の実感にどれくらい当てはまるかを選んでください。';
  $('choices').replaceChildren(...labels.map((label,i)=>{const el=text('button',`${i+1}　${label}`);el.type='button';el.className='choice';el.setAttribute('aria-pressed',String(a.status==='answered'&&a.value===i+1));el.onclick=()=>choose('answered',i+1);return el;}));
  for(const [id,state]of [['na','no_opportunity'],['unknown','cannot_judge']])$(id).setAttribute('aria-pressed',String(a.status===state));
  $('next').disabled=a.status==='unanswered';$('next').textContent=session.index===129?'結果を見る':'次へ';$('back').disabled=session.index===0;$('review').disabled=answered()!==130;
}
function choose(state,value=null){session.answers[session.sequence[session.index].slotId]={status:state,value};save();render();}
function table(headers,rows){const t=document.createElement('table'),head=document.createElement('tr');for(const h of headers)head.append(text('th',h));t.append(head);for(const row of rows){const tr=document.createElement('tr');for(const value of row)tr.append(text('td',String(value)));t.append(tr);}const wrap=document.createElement('div');wrap.className='table-wrap';wrap.append(t);return wrap;}
function results(){
  if(answered()!==130)return status('未回答があります。場面なし・判断できないは回答として区別して保存できます。');
  const r=core.score(bank,session);show('results');$('resultDemo').hidden=!session.demo;
  $('resultMeta').textContent=`${session.context} · ${session.variantMode==='A'?'A固定・固定順':'ABC実験・同等性未検証'} · ${r.numeric}問が数値回答 · 場面なし${r.missing.no_opportunity}／判断できない${r.missing.cannot_judge} · バンク ${bank.version} · 採点 ${bank.scoringVersion}`;
  $('resultBody').replaceChildren();
  for(const block of ['trait','mode','stress','axis']){
    $('resultBody').append(text('h2',blockNames[block]));
    if(block==='stress')$('resultBody').append(text('p','反応と対処は別の情報です。対処を逆転して反応の少なさにせず、同率・低反応・場面なしから代表ラベルを作りません。'));
    $('resultBody').append(table(['対象','暫定的な記述値 / 7','数値回答','集計の状態'],Object.entries(r.groups[block]).map(([name,g])=>[name,g.mean===null?'—':g.mean.toFixed(2),`${g.count}/${g.expected}`,g.reason?reasonNames[g.reason]:'A固定内の記述用平均。尺度としての妥当性は未検証'])));
    const detail=document.createElement('details');detail.append(text('summary','個々の回答を確認する'));
    for(const [name,g]of Object.entries(r.groups[block]))for(const item of g.items){const s=map.get(item.slotId),v=s.variants.find(v=>v.id===item.variantId);detail.append(text('p',`${name}｜${v.kind==='coping'?'対処・立て直し（反応に換算しない）':'回答項目'}｜${v.text} → ${raw(item)}`));}
    $('resultBody').append(detail);
  }
  $('resultBody').append(text('h2',blockNames.competency),text('p','右列は文面に書かれた行動の頻度をそのまま表示します。反対方向の行動でも逆転して意識と平均・減算しません。2問目はひっかけや嘘発見ではありません。'));
  $('resultBody').append(table(['項目','意識・意図枠の回答（当てはまり）','行動枠の回答（文面の頻度）'],Object.entries(r.groups.competency).map(([name,g])=>[name,raw(g.intent)+(g.intent.disposition==='hold'?'（原文の対象を確認中）':''),raw(g.behavior)])));
  const pairs=document.createElement('details');pairs.append(text('summary','意識・意図と行動の質問文を並べて確認する'));
  for(const [name,g]of Object.entries(r.groups.competency))for(const item of [g.intent,g.behavior]){const s=map.get(item.slotId),v=s.variants.find(v=>v.id===item.variantId);pairs.append(text('p',`${name}｜${item.role==='intent'?'意識・意図枠':'行動枠'}｜${v.text} → ${raw(item)}`));}
  $('resultBody').append(pairs,text('h2','対話で確かめること'),text('p','どんな場面・機会・役割を思い浮かべましたか。意識していたことと実際にできたことを、それぞれの言葉で振り返ってください。数値の差から嘘・抑圧・信頼性を判定しません。'),text('p','推進力・タイプ・Lv・行動発揮候補は算出しません。81問版の結果とは直接比較できません。'));
  save();
}
function start(demo=false){session=core.create(bank,$('context').value,Math.random,$('variant').value);session.demo=demo;persist=false;if(demo){for(const id of Object.keys(session.answers))session.answers[id]={status:'answered',value:4};results();}else render();status(demo?'架空回答です。本人の結果ではありません。':'自動保存はオフです。必要に応じて保存・書き出しをしてください。');}
function adopt(input){const valid=core.validate(bank,input);session=valid;persist=false;answered()===130?results():render();status('保存した変種・順序・欠測区分で再開しました。自動保存はオフです。');}
$('start').onclick=()=>start();$('demo').onclick=()=>start(true);
$('next').onclick=()=>{if(session.answers[session.sequence[session.index].slotId].status==='unanswered')return;if(session.index===129)results();else{session.index++;save();render();$('question').focus();}};
$('back').onclick=()=>{if(session.index>0){session.index--;save();render();}};
$('na').onclick=()=>choose('no_opportunity');$('unknown').onclick=()=>choose('cannot_judge');$('clear').onclick=()=>choose('unanswered');$('review').onclick=results;
$('edit').onclick=()=>{session.index=0;render();};$('print').onclick=()=>window.print();
$('save').onclick=()=>{if(!session)return status('先に試験を開始してください。');persist=true;save();};
$('resume').onclick=()=>{try{const data=localStorage.getItem(KEY);if(!data)return status('この版の保存回答はありません。');if(session&&!confirm('現在の回答を保存回答へ切り替えますか？'))return;adopt(JSON.parse(data));}catch(e){status('再開できません：'+e.message);}};
$('export').onclick=()=>{if(!session)return status('先に試験を開始してください。');const record=core.exportRecord(bank,session),url=URL.createObjectURL(new Blob([JSON.stringify(record,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`SpecV130_${session.demo?'DEMO_':''}${session.assessmentId}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('JSONを書き出しました。質問原文を含むため、公開せず保管してください。');};
$('import').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>2000000)throw Error('File too large');const data=JSON.parse(await file.text());core.validate(bank,data);if(session&&!confirm('現在の回答を読込ファイルへ切り替えますか？'))return;adopt(data);}catch(e){status('読み込めません：'+e.message);}finally{event.target.value='';}};
$('erase').onclick=()=>{if(confirm('この試験版の端末保存を削除しますか？ 原本ファイルは残ります。')){try{localStorage.removeItem(KEY);persist=false;status('この版の端末保存だけを削除しました。');}catch{status('端末保存を操作できません。');}}};
$('restart').onclick=()=>{if(!session||confirm('現在の回答を閉じますか？ 必要なら先に書き出してください。')){session=null;persist=false;show('intro');}};
show('intro');
})();
