/* global __dirname */
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const values=Object.fromEntries(fs.readFileSync(path.join(root, '.env.local'),'utf8').split(/\r?\n/).map(line=>line.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(match=>[match[1],match[2].trim().replace(/^['"]|['"]$/g,'')]));
(async()=>{
 for(const [label,path] of [['core','/webman/3rdparty/AudioStation/app/audio-core.js'],['station','/webman/3rdparty/AudioStation/audio_station.js']]){
  try{
   const response=await fetch(values.EXPO_PUBLIC_NAS_EXTERNAL_URL.replace(/\/$/,'')+path,{signal:AbortSignal.timeout(10000)});
   const content=await response.text();console.log(JSON.stringify({label,status:response.status,bytes:content.length}));
   if(response.status!==200)continue;
   for(const term of ['getsongcover','getCoverUrl','getCoverURL','getcover']){
    let index=-1,count=0;while((index=content.indexOf(term,index+1))>=0&&count++<8)console.log(content.slice(Math.max(0,index-180),index+450));
   }
  }catch(error){console.log(JSON.stringify({label,error:error.name,code:error.cause?.code}));}
 }
})();
