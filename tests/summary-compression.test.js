import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compressCollection } from '../scripts/compress-summaries.mjs';
import { unpack } from '../prototype/static-search/unpack-bundled.mjs';
test('compressed summaries preserve Unicode, row order and body references; remove obsolete files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shiju-summaries-'));
  try {
    const rows = Array.from({length:128}, (_,i)=>({id:`qing:${i}`, title:'𠮷 渔間□其一', author:'納蘭性德', body:i ? 0 : {hash:'a'.repeat(64),start:0}}));
    writeFileSync(dir+'/old.json', JSON.stringify(rows));
    writeFileSync(dir+'/manifest.json', JSON.stringify({count:128,size:128,summaries:['old.json'],body:{version:'v1'}}));
    const result = compressCollection(dir);
    const manifest = JSON.parse(readFileSync(dir+'/manifest.json'));
    assert.ok(result.after < result.before);
    assert.equal(existsSync(dir+'/old.json'),false);
    assert.deepEqual(unpack(JSON.parse(readFileSync(dir+'/'+manifest.summaries[0]))),rows);
    assert.deepEqual(manifest.body,{version:'v1'});
    compressCollection(dir);
    assert.deepEqual(JSON.parse(readFileSync(dir+'/manifest.json')),manifest);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('dataset compression versions manifests and indexes without mutating input', async () => {
  const {mkdirSync} = await import('node:fs');
  const {execFileSync} = await import('node:child_process');
  const root=mkdtempSync(join(tmpdir(),'shiju-summary-dataset-'));
  try {
    const input=root+'/input', output=root+'/output';
    mkdirSync(input+'/static-data/source/qing',{recursive:true});
    mkdirSync(input+'/static-data/index',{recursive:true});
    const config={version:'index',sourceVersion:'source',keys:['qing'],catalog:{qing:{file:'qing.json'}}};
    writeFileSync(input+'/static-data/metadata-current.json',JSON.stringify(config));
    writeFileSync(input+'/static-data/index/catalog.json',JSON.stringify(config));
    writeFileSync(input+'/static-data/source/qing/manifest.json',JSON.stringify({summaries:['old.json'],body:{version:'index',prefix:'qing/'}}));
    writeFileSync(input+'/static-data/source/qing/old.json',JSON.stringify([{id:'qing:0',title:'其一',body:{hash:'abc',start:0}}]));
    writeFileSync(input+'/body-inventory.json',JSON.stringify({indexVersion:'index',files:{'qing/abc.json':'abc'}}));
    execFileSync(process.execPath,['scripts/compress-summaries.mjs',input,output]);
    const c=JSON.parse(readFileSync(output+'/static-data/metadata-current.json'));
    assert.notEqual(c.version,'index'); assert.notEqual(c.sourceVersion,'source');
    assert.ok(existsSync(input+'/static-data/source/qing/old.json'));
    assert.deepEqual(JSON.parse(readFileSync(input+'/static-data/metadata-current.json')),config);
    assert.equal(JSON.parse(readFileSync(output+'/static-data/'+c.sourceVersion+'/qing/manifest.json')).body.version,c.version);
    assert.equal(JSON.parse(readFileSync(output+'/body-inventory.json')).indexVersion,c.version);
    assert.deepEqual(JSON.parse(readFileSync(output+'/static-data/'+c.version+'/catalog.json')),c);
    assert.throws(()=>execFileSync(process.execPath,['scripts/compress-summaries.mjs',input,output],{stdio:'pipe'}));
  } finally {rmSync(root,{recursive:true,force:true});}
});
