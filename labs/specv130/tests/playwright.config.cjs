const path=require('node:path');
module.exports={testDir:__dirname,testMatch:'ui.spec.cjs',workers:1,retries:0,timeout:60000,outputDir:path.resolve(__dirname,'../../../test-results/specv130-lab'),reporter:[['list'],['json',{outputFile:path.resolve(__dirname,'../../../tmp/specv130-lab-results.json')}]],use:{browserName:'chromium',headless:true,viewport:{width:1100,height:850}}};
