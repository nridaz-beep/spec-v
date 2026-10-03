'use strict';
const crypto=require('node:crypto');
function sign(bank){delete bank.sha256;bank.sha256=crypto.createHash('sha256').update(JSON.stringify(bank)).digest('hex');return bank;}
function fixture(){
  const slots=[];
  for(const [block,prefix,targets,size]of [['trait','T',4,4],['mode','M',4,4],['stress','S',4,4],['competency','C',16,2],['axis','X',5,10]])for(let t=1;t<=targets;t++)for(let i=1;i<=size;i++){
    const id=prefix+String(t).padStart(2,'0')+'-'+String(i).padStart(2,'0'),reverse=block!=='stress'&&i%2===0;
    const role=block==='competency'?(i===1?'intent':'behavior'):null,scale=block==='mode'||block==='stress'||role==='behavior'?'frequency':'agreement';
    slots.push({id,block,target:block+' '+t,reverse,role,scale,variants:[...'ABC'].map(label=>({id:id+'-'+label,label,text:'Synthetic item '+id+' '+label,reverse,scale,period:'Synthetic period',scene:'Synthetic scene',opportunity:'Synthetic opportunity',kind:block==='trait'?'preference':block==='stress'?'reaction':block==='axis'?'state':role==='intent'?'intent':'behavior',review:'Synthetic metadata only',equivalence:'unverified',disposition:'candidate'}))});
  }
  return sign({format:'specv130-bank-v3',version:'synthetic-v3',measurementVersion:'synthetic-measurement',scoringVersion:'synthetic-score',slots});
}
module.exports={fixture,sign};
