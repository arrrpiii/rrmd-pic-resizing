// Geometry checks are heuristics over MediaPipe landmarks, not guarantees of photo quality.
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const fail = message => ({ valid: false, message });
const bounds = points => ({
  left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)),
  top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)),
});
function angle(a, b, c) {
  const u = [a.x - b.x, a.y - b.y], v = [c.x - b.x, c.y - b.y];
  const length = Math.hypot(...u) * Math.hypot(...v);
  return length ? Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / length))) * 180 / Math.PI : 0;
}
export function validatePose(kind, detections, quality = {}, aspect = 1) {
  if (quality.brightness < 45) return fail('Move into brighter, even light.');
  if (quality.brightness > 235) return fail('Reduce the bright light in front of the camera.');
  if (detections.length !== 1) return fail(detections.length ? `Keep only one ${kind === 'earrings' ? 'face' : 'hand'} in the frame.` : kind === 'earrings' ? 'Bring your face into the frame.' : 'Show one whole hand with your fingers open.');
  const raw = detections[0];
  if (raw.length < (kind === 'earrings' ? 468 : 21) || raw.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return fail('Keep your whole face or hand clearly visible.');
  const b = bounds(raw);
  if (b.left < .04 || b.right > .96 || b.top < .04 || b.bottom > .96) return fail('Move back slightly. Keep all edges inside the frame.');
  // Aspect-correct distances and angles for landscape and portrait cameras.
  const p = raw.map(point => ({ ...point, x: point.x * aspect }));
  if (kind === 'earrings') {
    if (b.bottom - b.top < .3) return fail('Move your face a little closer.');
    const left = p[234], right = p[454], nose = p[1];
    const width = distance(left, right);
    if (Math.abs(nose.x - (left.x + right.x) / 2) / width > .16) return fail('Face the camera straight on.');
    if (Math.abs(p[33].y - p[263].y) / distance(p[33], p[263]) > .18) return fail('Keep your head upright.');
    const noseHeight = (p[1].y - p[10].y) / (p[152].y - p[10].y);
    if (noseHeight < .4 || noseHeight > .75) return fail('Keep your chin level with the camera.');
  } else {
    const palm = distance(p[5], p[17]);
    if (b.bottom - b.top < .32 || palm < .1) return fail('Move your hand closer to the camera.');
    const fingers = [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
    for (const [base, pip, dip, tip] of fingers) {
      if (angle(p[base], p[pip], p[tip]) < 150 || angle(p[pip], p[dip], p[tip]) < 145 || distance(p[tip], p[0]) < distance(p[pip], p[0]) * 1.1) return fail('Straighten and open all four fingers.');
    }
    if (distance(p[4], p[5]) < palm * .45 || angle(p[2], p[3], p[4]) < 140) return fail('Open your thumb away from your fingers.');
    for (const [a, b] of [[8, 12], [12, 16], [16, 20]]) {
      if (distance(p[a], p[b]) < palm * .28) return fail('Spread your fingers a little farther apart.');
    }
    if (Math.abs((raw[5].z || 0) - (raw[17].z || 0)) * aspect > palm * .7) return fail('Hold your hand flat toward the camera.');
  }
  return { valid: true, message: 'Pose ready. Hold still.', landmarks: raw };
}

export function motionBetween(previous, current, aspect = 1) {
  if (!previous || previous.length !== current.length) return 0;
  return Math.max(...current.map((p, i) => Math.hypot((p.x - previous[i].x) * aspect, p.y - previous[i].y)));
}

export class CaptureGate {
  constructor() { this.reset(); }
  reset() { this.since = null; this.last = null; this.done = false; }
  update(valid, now, mode = 'auto') {
    if (!valid || (this.last !== null && now - this.last > 650)) this.since = null;
    this.last = now;
    if (!valid || this.done) return { ready: false, remaining: null, capture: false };
    this.since ??= now;
    const ready = now - this.since >= 600;
    if (mode === 'manual' || !ready) return { ready, remaining: null, capture: false };
    const remaining = Math.max(0, Math.ceil((3600 - (now - this.since)) / 1000));
    if (!remaining) this.done = true;
    return { ready, remaining, capture: this.done };
  }
}

export function placementsFor(kind, points, width, height) {
  const at = i => ({ x: points[i].x * width, y: points[i].y * height });
  if (kind === 'earrings') {
    const a = at(234), b = at(454), chin = at(152);
    const span = Math.hypot(a.x - b.x, a.y - b.y);
    return [a, b].map(p => ({ x: p.x, y: p.y + (chin.y - p.y) * .23, width: span * .13, angle: 0 }));
  }
  const base = at(13), joint = at(14), palmA = at(5), palmB = at(17);
  return [{ x: base.x + (joint.x - base.x) * .32, y: base.y + (joint.y - base.y) * .32,
    width: Math.hypot(palmA.x - palmB.x, palmA.y - palmB.y) * .26,
    angle: Math.atan2(joint.y - base.y, joint.x - base.x) + Math.PI / 2 }];
}
