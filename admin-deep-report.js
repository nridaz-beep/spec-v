(() => {
  'use strict';
  const panel=document.createElement('section');
  panel.className='deep-report-panel';
  panel.innerHTML=`<h2>深掘りレポート</h2>
    <p>対象トークンを選び、診断通知メールの「全データJSON」を貼り付けてください。入力は生成のためにAnthropic APIへ送信されます。Spec-VのDB・ブラウザストレージには保存しません。</p>
    <label for="dr-token">対象トークン</label><select id="dr-token"><option value="">選択してください</option></select>
    <label for="dr-json">診断JSON</label><textarea id="dr-json" rows="8" spellcheck="false" autocomplete="off" placeholder='{"token_id":"F026", ...}'></textarea>
    <p>プロフィール・6軸・16項目・性向・モード・ストレスを含むJSONを使用します。自由記述や過去データも、含まれていれば分析に使います。</p>
    <div class="dr-actions"><button type="button" class="btn btn-paid" id="dr-generate">深掘りレポート生成</button><button type="button" class="btn btn-outline" id="dr-clear">入力・結果を消去</button><button type="button" class="btn btn-outline" id="dr-download" disabled>Markdownを保存</button></div>
    <p id="dr-status" role="status" aria-live="polite"></p><pre id="dr-output" tabindex="0" aria-label="生成した深掘りレポート" hidden></pre>`;
  document.getElementById('adminShell').appendChild(panel);
  const el=id=>document.getElementById('dr-'+id);
  let result=null, busy=false;
  function resetResult(){result=null;el('output').textContent='';el('output').hidden=true;el('download').disabled=true;el('status').textContent='';}
  function refreshTokens(){
    const current=el('token').value;
    el('token').replaceChildren(new Option('選択してください',''));
    for(const t of tokens) el('token').add(new Option(`${t.id} — ${t.note || 'メモなし'}`,t.id));
    el('token').value=current;
  }
  new MutationObserver(refreshTokens).observe(document.getElementById('tokenTable'),{childList:true});
  refreshTokens();
  el('json').addEventListener('input',resetResult);
  el('token').addEventListener('change',resetResult);
  el('clear').onclick=()=>{if(busy)return;el('json').value='';resetResult();};
  el('generate').onclick=async()=>{
    if(busy)return;
    resetResult();
    const token_id=el('token').value;
    let diagnostic;
    try {diagnostic=JSON.parse(el('json').value);}catch{el('status').textContent='JSONの部分だけを貼り付けてください。';return;}
    if(!token_id || String(diagnostic?.token_id||'').trim().toUpperCase()!==token_id){el('status').textContent='対象トークンとJSON内のtoken_idを一致させてください。';return;}
    const password=sessionStorage.getItem(ADMIN_PASSWORD_KEY);
    if(!password){el('status').textContent='管理画面へ再ログインしてください。';return;}
    busy=true;
    for(const id of ['generate','clear','json','token'])el(id).disabled=true;
    panel.setAttribute('aria-busy','true');
    el('status').textContent='深掘りレポートを生成しています。数分かかる場合があります。';
    try{
      const response=await fetch('/api/deep-report',{method:'POST',headers:{'Content-Type':'application/json','x-admin-password':password},body:JSON.stringify({token_id,diagnostic}),signal:AbortSignal.timeout(260000)});
      const data=await response.json().catch(()=>({error:'サーバーの応答を読み取れませんでした。'}));
      if(!response.ok)throw Error(data.error||'生成できませんでした。');
      if(data.token_id!==token_id || typeof data.report!=='string')throw Error('応答の対象トークンまたは本文を確認できませんでした。');
      result=data;
      el('output').textContent=data.report;
      el('output').hidden=false;
      el('download').disabled=false;
      const u=data.usage||{};
      el('status').textContent=`${token_id} 生成完了。配布前に内容をご確認ください。入力 ${u.input_tokens||0} / 出力 ${u.output_tokens||0} / キャッシュ読込 ${u.cache_read_input_tokens||0} / 作成 ${u.cache_creation_input_tokens||0} トークン`;
    }catch(error){el('status').textContent=error.name==='TimeoutError'?'応答待ちが終了しました。直ちに連打せず、時間を置いて再実行してください。':error.message;}
    finally{busy=false;panel.setAttribute('aria-busy','false');for(const id of ['generate','clear','json','token'])el(id).disabled=false;}
  };
  el('download').onclick=()=>{
    if(!result)return;
    const url=URL.createObjectURL(new Blob([result.report],{type:'text/markdown;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download=`specv_deep_${result.token_id}_${result.generated_at.slice(0,10)}.md`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
})();
