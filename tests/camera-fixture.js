// Browser integration fixture only. Not copied into the deployed build.
const points = Array.from({ length: 478 }, () => ({x:.5,y:.5,z:0}));
Object.assign(points, {234:{x:.3,y:.5,z:0},454:{x:.7,y:.5,z:0},1:{x:.5,y:.53,z:0},33:{x:.38,y:.4,z:0},263:{x:.62,y:.4,z:0},10:{x:.5,y:.2,z:0},152:{x:.5,y:.8,z:0}});
const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
const ctx = canvas.getContext('2d');
let draw;
navigator.mediaDevices.getUserMedia = async () => {
  draw = setInterval(() => { ctx.fillStyle = '#aaa'; ctx.fillRect(0,0,640,480); ctx.fillStyle='#d1bba1';ctx.beginPath();ctx.ellipse(320,240,125,160,0,0,7);ctx.fill(); },40);
  const stream = canvas.captureStream(25);
  const track = stream.getVideoTracks()[0], originalStop = track.stop.bind(track);
  track.stop = () => {clearInterval(draw);originalStop();};
  return stream;
};
const hand = [[.5,.85],[.33,.72],[.26,.65],[.2,.59],[.14,.53],[.36,.6],[.32,.43],[.29,.3],[.26,.17],[.46,.57],[.45,.39],[.44,.25],[.43,.11],[.56,.6],[.58,.44],[.6,.31],[.62,.18],[.65,.66],[.7,.53],[.75,.42],[.8,.31]].map(([x,y])=>({x,y,z:0}));
let invalidPose = false;
const togglePose = document.createElement('button'); togglePose.textContent = 'Test: hide subject';
togglePose.onclick = () => { invalidPose = !invalidPose; togglePose.textContent = invalidPose ? 'Test: show subject' : 'Test: hide subject'; };
document.querySelector('.toolbar').append(togglePose);
window.Worker = class {
  postMessage(data) {
    if (data.type === 'init') { this.kind = data.kind; setTimeout(() => this.onmessage?.({data:{type:'ready'}}),30); }
    else {data.bitmap.close();setTimeout(()=> this.onmessage?.({data:{type:'result',points:invalidPose ? [] : [this.kind === 'ring' ? hand : points],timestamp:data.timestamp}}),30);}
  }
  terminate() {this.onmessage=null;}
};
await import('../tryon.js');
