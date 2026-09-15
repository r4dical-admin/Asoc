import readline from 'node:readline';
import {writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const reader=readline.createInterface({input:process.stdin});let child;
reader.on('line',async line=>{
  if(!child){reader.pause();await writeFile('/tmp/bundle.json',line,{mode:0o600});child=spawn(process.execPath,['src/'+process.argv[2]],{env:process.env,stdio:['pipe','inherit','inherit']});child.on('close',code=>process.exit(code||0));reader.resume();}
  else child.stdin.write(line+'\n');
});
