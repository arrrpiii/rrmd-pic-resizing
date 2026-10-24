import test from 'node:test';
import assert from 'node:assert/strict';
import { CaptureGate, validatePose, motionBetween, placementsFor } from '../capture-logic.js';
const p = (x, y, z = 0) => ({ x, y, z });
function face() {
  const points = Array.from({ length: 478 }, () => p(.5, .5));
  Object.assign(points, { 234: p(.3, .5), 454: p(.7, .5), 1: p(.5, .53), 33: p(.38, .4), 263: p(.62, .4), 10: p(.5, .2), 152: p(.5, .8) });
  return points;
}
function hand() {
  return [p(.5,.85),p(.33,.72),p(.26,.65),p(.2,.59),p(.14,.53),
    p(.36,.6),p(.32,.43),p(.29,.3),p(.26,.17),
    p(.46,.57),p(.45,.39),p(.44,.25),p(.43,.11),
    p(.56,.6),p(.58,.44),p(.6,.31),p(.62,.18),
    p(.65,.66),p(.7,.53),p(.75,.42),p(.8,.31)];
}
test('auto waits for stable pose, displays 3–2–1 and captures once', () => {
  const gate = new CaptureGate();
  assert.equal(gate.update(true, 0).remaining, null);
  for (let t = 100; t < 600; t += 100) assert.equal(gate.update(true, t).capture, false);
  assert.equal(gate.update(true, 600).remaining, 3);
  for (let t = 700; t < 1600; t += 100) gate.update(true, t);
  assert.equal(gate.update(true, 1600).remaining, 2);
  for (let t = 1700; t < 2600; t += 100) gate.update(true, t);
  assert.equal(gate.update(true, 2600).remaining, 1);
  for (let t = 2700; t < 3600; t += 100) gate.update(true, t);
  assert.equal(gate.update(true, 3600).capture, true);
  assert.equal(gate.update(true, 3700).capture, false);
});
test('invalid pose and missing frames restart the full countdown', () => {
  const gate = new CaptureGate();
  for (let t = 0; t <= 2500; t += 100) gate.update(true, t);
  assert.equal(gate.update(false, 2600).remaining, null);
  assert.equal(gate.update(true, 2700).remaining, null);
  for (let t = 2800; t <= 3300; t += 100) gate.update(true, t);
  assert.equal(gate.update(true, 3400).remaining, 3);
  assert.equal(gate.update(true, 5000).remaining, null);
  assert.equal(gate.update(true, 5000).capture, false);
});
test('manual becomes ready but never captures automatically', () => {
  const gate = new CaptureGate(); let result;
  for (let t = 0; t <= 10000; t += 100) { result = gate.update(true, t, 'manual'); assert.equal(result.capture, false); assert.equal(result.remaining, null); }
  assert.equal(result.ready, true); gate.reset(); assert.equal(gate.update(true, 11000, 'auto').remaining, null);
});
test('face check accepts a framed upright face and rejects missing, multiple, tilted and turned faces', () => {
  assert.equal(validatePose('earrings', [face()]).valid, true);
  assert.equal(validatePose('earrings', []).valid, false);
  assert.equal(validatePose('earrings', [face(), face()]).valid, false);
  const turned = face(); turned[1].x = .65; assert.match(validatePose('earrings', [turned]).message, /straight on/);
  const tilted = face(); tilted[33].y = .5; assert.match(validatePose('earrings', [tilted]).message, /upright/);
  const clipped = face(); clipped[10].y = .01; assert.match(validatePose('earrings', [clipped]).message, /edges/);
});
test('hand check requires straight spread fingers and an open thumb', () => {
  assert.equal(validatePose('ring', [hand()]).valid, true);
  const folded = hand(); folded[16] = p(.57,.7); assert.match(validatePose('ring', [folded]).message, /Straighten/);
  const thumb = hand(); thumb[4] = p(.36,.6); assert.match(validatePose('ring', [thumb]).message, /thumb/);
  const closed = hand(); for (const i of [5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]) closed[i].x = .35 + Math.floor((i-5)/4)*.1;
  closed[16].x = closed[12].x + .01;
  assert.equal(validatePose('ring', [closed]).valid, false);
  assert.equal(validatePose('ring', [hand(), hand()]).valid, false);
});
test('lighting and motion checks reject bad conditions', () => {
  assert.equal(validatePose('earrings', [face()], { brightness: 20 }).valid, false);
  assert.equal(validatePose('ring', [hand()], { brightness: 245 }).valid, false);
  assert.equal(motionBetween(face(), face()), 0);
  const shifted = face().map(point => ({ ...point, x: point.x + .1 }));
  assert.ok(motionBetween(face(), shifted) > .025);
});
test('landmark placement returns two earrings or one ring with finite coordinates', () => {
  const earrings = placementsFor('earrings', face(), 1280, 960);
  const ring = placementsFor('ring', hand(), 1280, 960);
  assert.equal(earrings.length, 2); assert.equal(ring.length, 1);
  for (const placement of [...earrings, ...ring]) for (const value of Object.values(placement)) assert.ok(Number.isFinite(value));
  assert.ok(ring[0].x > hand()[13].x * 1280 && ring[0].x < hand()[14].x * 1280);
});
