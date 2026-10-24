const test = require('node:test')
const assert = require('node:assert/strict')
const { loadService } = require('./load-service.cjs')
function setup(acquire, replace) {
  const old = { kind:'video', enabled:false, stopped:false, stop(){this.stopped=true} }
  const audio = { kind:'audio', enabled:true }
  const tracks = [old,audio]
  const stream = { getVideoTracks:()=>tracks.filter(t=>t.kind==='video'), removeTrack:t=>tracks.splice(tracks.indexOf(t),1), addTrack:t=>tracks.push(t) }
  const sent=[]
  const pc = { getSenders:()=>[{track:old,replaceTrack:async t=>{if(replace)await replace(t);sent.push(t)}}] }
  const { replaceCallCamera } = loadService('frontend/lib/call-camera.ts', {}, { navigator:{mediaDevices:{getUserMedia:acquire}}, DOMException })
  return {old,audio,tracks,stream,pc,sent,run:(current=()=>true)=>replaceCallCamera(pc,stream,'environment',current)}
}
function capture() {
  const track={kind:'video',enabled:true,stopped:false,stop(){this.stopped=true}}
  return {track,stream:{getVideoTracks:()=>[track],getTracks:()=>[track]}}
}
test('switches outgoing sender, preserves audio and camera-off state, releases previous camera',async()=>{
  const next=capture();let constraints
  const ctx=setup(async c=>{constraints=c;return next.stream})
  assert.equal(await ctx.run(),next.track)
  assert.equal(constraints.audio,false);assert.equal(constraints.video.facingMode.exact,'environment')
  assert.equal(next.track.enabled,false);assert.equal(ctx.old.stopped,true)
  assert.deepEqual(ctx.tracks,[ctx.audio,next.track]);assert.deepEqual(ctx.sent,[next.track])
})
test('unavailable camera keeps the working original track',async()=>{
  const ctx=setup(async()=>{throw new DOMException('No rear camera','OverconstrainedError')})
  await assert.rejects(ctx.run());assert.equal(ctx.old.stopped,false);assert.equal(ctx.sent.length,0)
})
test('camera opened after hangup is stopped without replacing the sender',async()=>{
  const next=capture();let active=true
  const ctx=setup(async()=>{active=false;return next.stream})
  assert.equal(await ctx.run(()=>active),null);assert.equal(next.track.stopped,true);assert.equal(ctx.sent.length,0)
})
test('sender replacement failure releases new capture and retains old camera',async()=>{
  const next=capture();const ctx=setup(async()=>next.stream,async()=>{throw Error('replace failed')})
  await assert.rejects(ctx.run());assert.equal(next.track.stopped,true);assert.equal(ctx.old.stopped,false)
})
test('phones with exclusive camera access release old camera and retry',async()=>{
  const next=capture();let attempts=0
  const ctx=setup(async()=>{if(++attempts===1)throw new DOMException('Busy','NotReadableError');return next.stream})
  await ctx.run();assert.equal(attempts,2);assert.equal(ctx.old.stopped,true);assert.equal(ctx.sent[0],next.track)
})
test('failed exclusive switch restores the previous camera with its camera-off state',async()=>{
  const restored=capture();let attempts=0
  const ctx=setup(async c=>{attempts++;if(attempts===1)throw new DOMException('Busy','NotReadableError');if(attempts===2)throw Error('rear failed');assert.equal(c.video.facingMode.exact,'user');return restored.stream})
  await assert.rejects(ctx.run());assert.equal(ctx.sent[0],restored.track);assert.equal(restored.track.enabled,false);assert.equal(ctx.tracks.includes(ctx.audio),true)
})
