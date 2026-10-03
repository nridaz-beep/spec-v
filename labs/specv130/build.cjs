'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const core=require('./core');
function build(bankPath,out){
  const bank=JSON.parse(fs.readFileSync(bankPath,'utf8')),unsigned={...bank};delete unsigned.sha256;
  const hash=crypto.createHash('sha256').update(JSON.stringify(unsigned)).digest('hex');
  if(hash!==bank.sha256)throw Error('Bank hash mismatch: review and issue a new bank revision');
  core.validateBank(bank);
  if(path.resolve(bankPath)===path.resolve(out,'bank.json'))throw Error('Never overwrite the input bank');
  fs.mkdirSync(out,{recursive:true});
  const sources={BANK:JSON.stringify(bank),CORE:fs.readFileSync(path.join(__dirname,'core.js'),'utf8'),APP:fs.readFileSync(path.join(__dirname,'app.js'),'utf8')};
  let html=fs.readFileSync(path.join(__dirname,'template.html'),'utf8');
  html=html.replace(/__(BANK|CORE|APP)__/g,(_,key)=>sources[key].replace(/<\/script/gi,'<\\/script'));
  fs.writeFileSync(path.join(out,'SpecV_130_trial.html'),html);
  fs.writeFileSync(path.join(out,'bank.json'),JSON.stringify(bank,null,2));
  for(const name of ['core.js','app.js','template.html'])fs.copyFileSync(path.join(__dirname,name),path.join(out,name));
  return path.resolve(out,'SpecV_130_trial.html');
}
if(require.main===module){const [bank,out]=process.argv.slice(2);if(!bank||!out)throw Error('Usage: node labs/specv130/build.cjs PRIVATE_REVIEWED_BANK PRIVATE_OUTPUT_DIR');console.log(build(bank,out));}
module.exports={build};
