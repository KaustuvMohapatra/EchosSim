/**
 * EchoSim original resident pixel-art assets, deterministic PNG exporter.
 * 32 unique variants, 128x240 per image, 4 columns x 5 pose rows:
 * front / back / left / right / seated. Every cell is 32x48.
 *
 * Run: node tools/generate-resident-atlases.mjs
 * Art is original project-owned pixel drawing, not a third-party sprite pack.
 */
const SKIN=['#f4c9a3','#ecc09a','#d99b73','#c98561','#a76b4c','#875239','#f7d8b3'];
const HAIR=['#241d2d','#56382e','#76513d','#1e313c','#98683a','#643e4a','#c6a36b','#392e38','#ae7550'];
const TOP=['#6faba2','#ca7b67','#7b8dbc','#b88eac','#bca25f','#809c79','#c37688','#638b9c','#b89872','#8d77b1','#a9a0c5','#cd8566','#687e67','#bd6679','#d2ab70','#6e8fbd'];
const PANTS=['#34475c','#534c5a','#4d5f54','#66513f','#4a3e5b','#465c64','#534b46'];
const ACCENT=['#f1d39b','#bde8d8','#e9b4bf','#e5ddbe','#c3c9e9','#b8d59b','#f4a177'];
function rgb(s){return [1,3,5].map(i=>parseInt(s.slice(i,i+2),16));}
function tint(s,d){return '#'+rgb(s).map(v=>Math.max(0,Math.min(255,v+d)).toString(16).padStart(2,'0')).join('');}
function u32(v){return [(v>>>24)&255,(v>>>16)&255,(v>>>8)&255,v&255];}
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);}return (c^0xffffffff)>>>0;}
function chunk(name,data){const payload=[...name].map(c=>c.charCodeAt(0)).concat(data);return [...u32(data.length),...payload,...u32(crc32(payload))];}
function encodePng(pixels,palette,w=128,h=240){
  const raw=new Uint8Array((w+1)*h);
  for(let y=0;y<h;y++){raw[y*(w+1)]=0;raw.set(pixels.subarray(y*w,(y+1)*w),y*(w+1)+1);}
  let a=1,b=0;for(const x of raw){a=(a+x)%65521;b=(b+a)%65521;}
  const z=[0x78,0x01];let pos=0;
  while(pos<raw.length){const end=Math.min(raw.length,pos+65535),len=end-pos;
    z.push(end===raw.length?1:0,len&255,(len>>8)&255,(~len)&255,((~len)>>8)&255);
    for(let j=pos;j<end;j++)z.push(raw[j]);pos=end;
  }
  z.push(...u32(((b<<16)|a)>>>0));
  return Uint8Array.from([137,80,78,71,13,10,26,10,
    ...chunk('IHDR',[...u32(w),...u32(h),8,3,0,0,0]),
    ...chunk('PLTE',palette.flatMap(rgb)),
    ...chunk('tRNS',[0,...new Array(palette.length-1).fill(255)]),
    ...chunk('IDAT',z),...chunk('IEND',[])]);
}
function residentPixels(n){
  const skin=SKIN[(n*5+2)%SKIN.length],hair=HAIR[(n*7+Math.floor(n/5))%HAIR.length],
    top=TOP[(n*11+Math.floor(n/6))%TOP.length],
    pant=PANTS[(n*3+Math.floor(n/4))%PANTS.length],
    accent=ACCENT[(n*3+Math.floor(n/7))%ACCENT.length];
  const palette=['#000000','#242331',skin,tint(skin,-33),hair,tint(hair,24),
    top,tint(top,-28),tint(top,25),pant,tint(pant,23),tint(pant,-42),
    accent,'#262333',tint(accent,21),'#303643'];
  const pixels=new Uint8Array(128*240),style=n%9,outfit=(Math.floor(n/2)+n)%6,accessory=(n*7+Math.floor(n/5))%9;
  for(let row=0;row<5;row++)for(let frame=0;frame<4;frame++){
    const ox=frame*32,oy=row*48,back=row===1,side=row===2||row===3,left=row===2,sit=row===4;
    const stride=sit?0:[0,-2,0,2][frame],arm=sit?0:[0,1,0,-1][frame],bob=sit?1+(frame%2):frame%2;
    const rect=(x,y,x2,y2,c)=>{x=Math.max(0,Math.floor(x));y=Math.max(0,Math.floor(y));
      x2=Math.min(31,Math.floor(x2));y2=Math.min(47,Math.floor(y2));
      for(let yy=y;yy<=y2;yy++)for(let xx=x;xx<=x2;xx++)pixels[(oy+yy)*128+ox+xx]=c;};
    const dot=(x,y,c)=>rect(x,y,x,y,c);
    const hx=left?10:side?11:10,hy=7+bob;
    rect(10,46,22,46,15);
    if(sit){rect(7,38,25,41,1);rect(9,39,23,40,9);rect(7,41,14,43,1);
      rect(18,41,25,43,1);rect(8,42,13,42,11);rect(19,42,24,42,11);}
    else for(const [x,delta] of [[10,stride],[18,-stride]]){
      rect(x+delta-1,32+bob,x+delta+6,43,1);rect(x+delta,33+bob,x+delta+5,40,9);
      rect(x+delta+1,34+bob,x+delta+2,39,10);rect(x+delta-2,42,x+delta+6,44,11);
      rect(x+delta-1,42,x+delta+2,42,10);
    }
    for(const [x,dlt] of [[5,-arm],[22,arm]]){
      rect(x+dlt-1,22+bob,x+dlt+6,36+bob,1);rect(x+dlt,23+bob,x+dlt+5,32+bob,7);
      rect(x+dlt+1,24+bob,x+dlt+4,28+bob,6);rect(x+dlt,33+bob,x+dlt+5,36+bob,2);
      rect(x+dlt+1,34+bob,x+dlt+4,35+bob,3);
    }
    if(outfit===1){rect(9,20+bob,24,37+bob,1);rect(10,21+bob,23,35+bob,6);
      rect(11,21+bob,11,35+bob,7);rect(19,21+bob,22,35+bob,7);rect(15,23+bob,18,34+bob,12);}
    else if(outfit===2){rect(9,21+bob,23,31+bob,1);rect(8,30+bob,24,39+bob,1);
      rect(10,22+bob,22,30+bob,6);rect(9,31+bob,23,36+bob,6);
      rect(11,32+bob,11,36+bob,8);rect(9,37+bob,23,38+bob,7);}
    else if(outfit===3){rect(9,21+bob,23,37+bob,1);rect(10,22+bob,22,35+bob,6);
      rect(12,26+bob,20,36+bob,12);rect(13,27+bob,19,28+bob,14);rect(14,32+bob,18,33+bob,7);}
    else if(outfit===4){rect(8,19+bob,24,36+bob,1);rect(9,21+bob,23,34+bob,7);
      rect(10,22+bob,22,32+bob,6);rect(13,24+bob,19,25+bob,8);rect(14,29+bob,18,31+bob,7);}
    else if(outfit===5){rect(9,21+bob,23,36+bob,1);rect(10,22+bob,22,34+bob,6);
      rect(14,23+bob,18,33+bob,12);rect(15,25+bob,17,29+bob,7);rect(10,34+bob,22,35+bob,7);}
    else {rect(9,21+bob,23,36+bob,1);rect(10,22+bob,22,34+bob,6);
      rect(11,23+bob,11,31+bob,8);rect(15,23+bob,17,33+bob,12);
      rect(19,23+bob,21,33+bob,7);rect(10,34+bob,22,35+bob,7);}
    rect(hx-1,hy+1,hx+13,hy+15,1);rect(hx,hy+3,hx+12,hy+14,2);
    rect(hx+1,hy+4,hx+3,hy+10,3);rect(hx-2,hy+8,hx-1,hy+11,3);
    rect(hx+13,hy+8,hx+14,hy+11,3);rect(hx-1,hy,hx+13,hy+5,4);rect(hx,hy,hx+6,hy,5);
    if(style===0){rect(hx-2,hy+3,hx,hy+15,4);rect(hx+12,hy+3,hx+14,hy+14,4);}
    else if(style===1){rect(hx-1,hy-2,hx+4,hy+2,4);rect(hx+5,hy-3,hx+9,hy+1,5);}
    else if(style===2){rect(hx-2,hy+5,hx,hy+22,4);rect(hx+12,hy+5,hx+14,hy+21,4);}
    else if(style===3){rect(hx-2,hy+2,hx+4,hy+8,4);rect(hx+6,hy+4,hx+13,hy+6,4);}
    else if(style===4){rect(hx-4,hy-2,hx+1,hy+4,1);rect(hx-3,hy-2,hx,hy+2,4);
      rect(hx+11,hy-3,hx+16,hy+3,1);rect(hx+12,hy-2,hx+15,hy+2,4);}
    else if(style===5){for(const [x,y] of [[hx-2,hy+3],[hx+1,hy-3],[hx+6,hy-3],
      [hx+10,hy-2],[hx+12,hy+5],[hx-2,hy+10]]){rect(x,y,x+4,y+4,1);rect(x+1,y+1,x+3,y+3,4);}}
    else if(style===6){rect(hx-2,hy+2,hx+1,hy+12,4);rect(hx+12,hy+5,hx+16,hy+18,4);}
    else if(style===7){rect(hx-1,hy+3,hx+1,hy+8,3);rect(hx+5,hy-2,hx+13,hy+4,4);}
    else {rect(hx-2,hy-1,hx+14,hy+4,12);rect(hx-1,hy+3,hx+13,hy+5,7);}
    if(back){rect(hx,hy+6,hx+12,hy+13,4);rect(hx+3,hy+6,hx+5,hy+10,5);}
    else if(side){const ex=left?hx+3:hx+9;rect(ex,hy+8,ex+1,hy+9,13);}
    else {rect(hx+3,hy+(frame===3?9:8),hx+4,hy+9,13);
      rect(hx+9,hy+(frame===3?9:8),hx+10,hy+9,13);rect(hx+6,hy+12,hx+8,hy+12,3);}
    if(accessory===0&&!back){rect(hx+1,hy+7,hx+5,hy+10,1);rect(hx+8,hy+7,hx+12,hy+10,1);
      rect(hx+2,hy+8,hx+4,hy+9,2);rect(hx+9,hy+8,hx+11,hy+9,2);rect(hx+6,hy+8,hx+7,hy+8,1);}
    else if(accessory===1){rect(10,20+bob,22,23+bob,12);rect(19,22+bob,21,27+bob,12);}
    else if(accessory===2){rect(23,29+bob,29,39+bob,1);rect(24,30+bob,28,37+bob,12);}
    else if(accessory===3&&!back){rect(hx-2,hy+13,hx-2,hy+15,12);rect(hx+14,hy+13,hx+14,hy+15,12);}
    else if(accessory===4){rect(13,22+bob,19,24+bob,12);rect(15,23+bob,17,24+bob,1);}
    else if(accessory===5){for(let k=0;k<5;k++)rect(11+k*2,25+bob+k*2,12+k*2,26+bob+k*2,12);}
    else if(accessory===6){rect(hx+7,hy+2,hx+11,hy+3,12);}
    else if(accessory===7){rect(22+arm,31+bob,26+arm,32+bob,12);}
  }
  return { pixels, palette };
}
/** Generate one ready-to-load PNG as Uint8Array. */
function generateResidentPng(index){
  if(!Number.isInteger(index)||index<0||index>=32)throw new Error('Resident index must be 0-31.');
  const art=residentPixels(index);return encodePng(art.pixels,art.palette);
}
if(typeof process!=='undefined' && process.argv?.[1]?.endsWith('generate-resident-atlases.mjs')){
  const fs=await import('node:fs/promises');
  const dir=new URL('../apps/life/public/assets/residents/',import.meta.url);
  await fs.mkdir(dir,{recursive:true});
  for(let n=0;n<32;n++)await fs.writeFile(new URL('resident-'+String(n).padStart(2,'0')+'.png',dir),generateResidentPng(n));
  console.log('Wrote 32 resident animation atlases.');
}
