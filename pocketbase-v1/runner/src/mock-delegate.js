import {readFile} from 'node:fs/promises';
const bundle=JSON.parse(await readFile(process.env.ASOC_BUNDLE_PATH,'utf8'));
const text='[Mock mode] '+(bundle.messages?.at(-1)?.content || 'Completed '+bundle.title);
for(const word of text.split(' ')){console.log(JSON.stringify({type:'delta',text:word+' '}));await new Promise(r=>setTimeout(r,20));}
console.log(JSON.stringify({type:'completed',text}));
