import test from 'node:test';
import assert from 'node:assert/strict';
import {productBounds} from '../product-image.js';
function pixels(alpha=255) {const data=new Uint8ClampedArray(10*10*4);for(let i=3;i<data.length;i+=4)data[i]=alpha;return {data,width:10,height:10};}
test('opaque images are accepted at full bounds rather than silently rejected',()=>{assert.deepEqual(productBounds(pixels()),{left:0,top:0,width:10,height:10,opaque:true});});
test('transparent outer padding is cropped',()=>{const img=pixels(0);for(let y=2;y<8;y++)for(let x=3;x<7;x++)img.data[(y*10+x)*4+3]=255;assert.deepEqual(productBounds(img),{left:3,top:2,width:4,height:6,opaque:false});});
test('almost opaque images are accepted and empty images report an error',()=>{const img=pixels();img.data[3]=0;assert.equal(productBounds(img).opaque,false);assert.throws(()=>productBounds(pixels(0)),/empty/);});
