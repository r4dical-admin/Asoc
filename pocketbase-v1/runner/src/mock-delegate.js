import {readFile} from 'node:fs/promises';
const bundle=JSON.parse(await readFile(process.env.ASOC_BUNDLE_PATH,'utf8'));
const draft=bundle.authoring?.kind==='overview'?{markdown:'# Overview draft\n\n[Mock mode] Review current incident evidence before publishing. This is a demonstration draft, not an AI analysis.'}:bundle.authoring?.current_draft;
const text=bundle.authoring?JSON.stringify({explanation:'[Mock mode] Demonstration proposal. Configure a real model for assisted authoring.',draft}):'[Mock mode] '+(bundle.messages?.at(-1)?.content || 'Completed '+bundle.title);
for(const word of text.split(' ')){console.log(JSON.stringify({type:'delta',text:word+' '}));await new Promise(r=>setTimeout(r,20));}
console.log(JSON.stringify({type:'completed',text}));
