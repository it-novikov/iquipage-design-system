import {test} from 'node:test';
import assert from 'node:assert/strict';
import {preparePhoto} from '../web/photo-prepare.js';

/** A browser stand-in: decode reports the picture's size, the canvas records drawing, encode makes a blob of a size. */
function browser({width,height,fail=false,bytes=()=>200_000}={}){
  const drawn=[],released=[];
  const decode=async file=>{if(fail)throw Error('The source image cannot be decoded.');return {image:{file},width,height,release:()=>released.push(file.name)};};
  const canvas=size=>({...size,getContext:()=>({clearRect(){},fillRect(){drawn.push('background');},drawImage:(_image,_x,_y,w,h)=>drawn.push(`${w}x${h}`)})});
  const encode=async(_canvas,type)=>new Blob([new Uint8Array(bytes(type))],{type});
  return {options:{decode,canvas,encode},drawn,released};
}
const file=(name,type,size=1000)=>new File([new Uint8Array(size)],name,{type});

test('a photo the cropper opens as it is is handed over untouched',async()=>{
  const b=browser({width:4032,height:3024}),original=file('IMG_1.jpg','image/jpeg',3_000_000);
  assert.equal(await preparePhoto(original,b.options),original);
  assert.deepEqual(b.released,['IMG_1.jpg'],'the decoded copy is released');
});

test('a 48-megapixel or 15 MB phone photo becomes a 2048 px JPEG',async()=>{
  for(const [width,height,size] of [[8064,6048,9_000_000],[4032,3024,15*1024*1024]]){
    const b=browser({width,height}),prepared=await preparePhoto(file('IMG_2.JPG','image/jpeg',size),b.options);
    assert.equal(prepared.type,'image/jpeg');assert.equal(prepared.name,'IMG_2.jpg');
    assert.deepEqual(b.drawn,['background','2048x1536']);
  }
});

test('a HEIC photo the browser reads becomes a JPEG; one it cannot read says what to do',async()=>{
  const safari=browser({width:4032,height:3024});
  const prepared=await preparePhoto(file('IMG_3.HEIC','image/heic',2_000_000),safari.options);
  assert.equal(prepared.type,'image/jpeg');assert.equal(prepared.name,'IMG_3.jpg');
  const chrome=browser({fail:true});
  await assert.rejects(preparePhoto(file('IMG_4.heic','',2_000_000),chrome.options),/HEIC.*JPEG/);
  await assert.rejects(preparePhoto(file('notes.txt','text/plain'),chrome.options),/JPEG, PNG или WebP/);
});

test('a GIF keeps transparency as PNG, and falls back to JPEG only when the PNG is too large',async()=>{
  const small=browser({width:600,height:400}),gif=await preparePhoto(file('smile.gif','image/gif'),small.options);
  assert.equal(gif.type,'image/png');assert.deepEqual(small.drawn,['600x400'],'no background under a transparent picture');
  const huge=browser({width:5000,height:5000,bytes:type=>type==='image/png'?11*1024*1024:900_000});
  const png=await preparePhoto(file('scan.png','image/png',30*1024*1024),huge.options);
  assert.equal(png.type,'image/jpeg');assert.deepEqual(huge.drawn,['2048x2048','background','2048x2048']);
});

test('a picture smaller than 32 px is refused before the cropper',async()=>{
  await assert.rejects(preparePhoto(file('icon.png','image/png'),browser({width:16,height:64}).options),/32 px/);
});
