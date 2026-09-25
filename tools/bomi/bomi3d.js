/* 봄이 3D — 돋보기 몸 + 새싹 머리 + 작은 팔다리. three.js 기본 도형만으로 만든다(외부 모델 파일 없음).
   buildBomi(THREE) → { group, setExpr(name), setPose(name), tick(t) }
   표정: idle · happy · think · wow · wink · talk      자세: stand · wave · point · hold */
export function buildBomi(THREE, opt = {}) {
  const WAVE = opt.wave ?? 1.9;
  const C = Object.assign({
    ring: 0x132c57, ringDeep: 0x0f2446, face: 0xffd48c, cheek: 0xf5a79a,
    leafA: 0x2e8b53, leafB: 0x4fae62, stem: 0x23693f, ink: 0x1b1c20, gold: 0xe0a43c, handle: 0x16305a
  }, opt.colors || {});
  const toy = (color, extra = {}) => new THREE.MeshPhysicalMaterial(Object.assign({ color, roughness: .38, metalness: 0, clearcoat: .6, clearcoatRoughness: .25, sheen: .2 }, extra));
  const g = new THREE.Group(); g.name = 'bomi';
  const body = new THREE.Group(); g.add(body);           // 흔들림·기울임용

  /* 돋보기 테(머리 겸 몸) */
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, .23, 40, 120), toy(C.ring, { roughness: .3 }));
  body.add(ring);
  // 테 안쪽 금색 얇은 띠
  const inner = new THREE.Mesh(new THREE.TorusGeometry(.83, .035, 16, 120), toy(C.gold, { metalness: .5, roughness: .3 }));
  inner.position.z = .12; body.add(inner);

  /* 얼굴(렌즈) — 앞쪽이 살짝 볼록한 원판 */
  const faceGeo = new THREE.SphereGeometry(.86, 64, 48); faceGeo.scale(1, 1, .4);
  const face = new THREE.Mesh(faceGeo, toy(C.face, { roughness: .55, clearcoat: .5, clearcoatRoughness: .2, sheen: .3, sheenColor: new THREE.Color(0xffe9c4) }));
  face.position.z = .06; body.add(face);
  // 뒤통수 — 옆에서 봐도 동전처럼 납작하지 않게 둥근 몸통
  const backGeo = new THREE.SphereGeometry(.98, 48, 32, Math.PI, Math.PI, 0, Math.PI); backGeo.scale(1, 1, .55);
  const back = new THREE.Mesh(backGeo, toy(C.ringDeep, { roughness: .45 })); back.position.z = -.08; body.add(back);
  // 렌즈 반사 하이라이트
  const glintGeo = new THREE.TorusGeometry(.62, .035, 8, 40, Math.PI * .42);
  const glint = new THREE.Mesh(glintGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .55 }));
  glint.position.set(0, 0, .39); glint.rotation.z = Math.PI * .58; body.add(glint);

  /* 눈 · 볼 · 입 */
  const F = new THREE.Group(); F.position.z = .36; body.add(F);
  const ink = new THREE.MeshStandardMaterial({ color: C.ink, roughness: .25 });
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  function eye(x) {
    const e = new THREE.Group(); e.position.set(x, .08, 0);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(.12, 32, 24), ink); ball.scale.set(1, 1.18, .55); e.add(ball);
    const hi = new THREE.Mesh(new THREE.SphereGeometry(.036, 16, 12), white); hi.position.set(.035, .05, .06); e.add(hi);
    const hi2 = new THREE.Mesh(new THREE.SphereGeometry(.016, 12, 8), white); hi2.position.set(-.035, -.045, .06); e.add(hi2);
    // 웃는 눈(^) — 기본은 숨김
    const arc = new THREE.Mesh(new THREE.TorusGeometry(.1, .028, 10, 24, Math.PI), ink); arc.position.y = -.02; arc.visible = false; e.add(arc);
    e.userData = { ball, hi, hi2, arc }; F.add(e); return e;
  }
  const eyeL = eye(-.32), eyeR = eye(.32);
  function cheek(x) { const m = new THREE.Mesh(new THREE.SphereGeometry(.1, 24, 16), new THREE.MeshStandardMaterial({ color: C.cheek, roughness: .9, transparent: true, opacity: .85 })); m.scale.set(1.25, .7, .2); m.position.set(x, -.16, .02); F.add(m); return m; }
  cheek(-.52); cheek(.52);
  const mouthSmile = new THREE.Mesh(new THREE.TorusGeometry(.13, .03, 10, 30, Math.PI * .9), ink);
  mouthSmile.rotation.z = Math.PI * 1.05; mouthSmile.position.set(0, -.13, .02); F.add(mouthSmile);
  const mouthOpen = new THREE.Mesh(new THREE.CircleGeometry(.16, 32, Math.PI, Math.PI), new THREE.MeshStandardMaterial({ color: 0x7a2424, roughness: .6, side: THREE.DoubleSide }));
  mouthOpen.position.set(0, -.1, .045); mouthOpen.visible = false; F.add(mouthOpen);
  const tongue = new THREE.Mesh(new THREE.SphereGeometry(.06, 16, 12), new THREE.MeshStandardMaterial({ color: 0xf08a7e })); tongue.scale.set(1.3, .55, .3); tongue.position.set(0, -.22, .05); tongue.visible = false; F.add(tongue);
  const mouthO = new THREE.Mesh(new THREE.TorusGeometry(.055, .025, 10, 24), ink); mouthO.position.set(.02, -.2, .02); mouthO.visible = false; F.add(mouthO);
  // 눈썹(생각할 때)
  const brow = new THREE.Mesh(new THREE.CapsuleGeometry(.02, .12, 4, 8), ink); brow.rotation.z = Math.PI / 2 + .35; brow.position.set(.33, .33, 0); brow.visible = false; F.add(brow);

  /* 새싹 */
  const sprout = new THREE.Group(); sprout.position.set(0, 1.12, 0); body.add(sprout);
  const stem = new THREE.Mesh(new THREE.CapsuleGeometry(.045, .22, 6, 12), toy(C.stem)); stem.position.y = .1; sprout.add(stem);
  function leaf(color, side) {
    const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.bezierCurveTo(.18, .12, .45, .12, .62, 0); shape.bezierCurveTo(.45, -.1, .18, -.1, 0, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: .04, bevelEnabled: true, bevelThickness: .03, bevelSize: .03, bevelSegments: 4, curveSegments: 24 }); geo.translate(0, 0, -.02);
    const m = new THREE.Mesh(geo, toy(color, { roughness: .6, clearcoat: .15 })); m.position.y = .22; m.rotation.z = side > 0 ? .55 : Math.PI - .55; m.rotation.x = side * .25;
    const vein = new THREE.Mesh(new THREE.CapsuleGeometry(.008, .4, 2, 6), new THREE.MeshStandardMaterial({ color: 0xd9f2c9 })); vein.rotation.z = Math.PI / 2; vein.position.set(.3, 0, .055); m.add(vein);
    sprout.add(m); return m;
  }
  const leafL = leaf(C.leafA, -1), leafR = leaf(C.leafB, 1);

  /* 손잡이 = 몸통 겸 다리 (오른쪽 아래로) */
  const handle = new THREE.Group(); handle.position.set(.62, -.78, -.02); handle.rotation.z = .62; body.add(handle);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .16, 32), toy(C.gold, { metalness: .5, roughness: .3 })); collar.position.y = -.06; handle.add(collar);
  const grip = new THREE.Mesh(new THREE.CapsuleGeometry(.16, .62, 8, 24), toy(C.handle, { roughness: .45 })); grip.position.y = -.5; handle.add(grip);
  // 손잡이 줄무늬 두 줄
  [-.36, -.56].forEach(y => { const b = new THREE.Mesh(new THREE.TorusGeometry(.165, .02, 8, 32), toy(C.gold, { metalness: .4 })); b.rotation.x = Math.PI / 2; b.position.y = y; handle.add(b); });

  /* 팔 — 테 양옆에서 뻗는 작은 벙어리장갑 손 */
  function arm(side) {
    const a = new THREE.Group(); a.position.set(side * 1.1, -.12, .04);
    const Hp = new THREE.Vector3(side * .4, -.24, .06), dir = Hp.clone().normalize(), len = Hp.length();
    const up = new THREE.Mesh(new THREE.CapsuleGeometry(.065, len - .1, 6, 12), toy(C.ringDeep));
    up.position.copy(Hp.clone().multiplyScalar(.5)); up.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); a.add(up);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(.13, 24, 16), toy(0xfff8ee, { roughness: .5 })); hand.position.copy(Hp); a.add(hand);
    a.userData = { up, hand }; body.add(a); return a;
  }
  const armL = arm(-1), armR = arm(1);

  /* 발 — 손잡이 끝이 아닌 테 아래에 짧은 두 발 */
  function foot(x) { const f = new THREE.Mesh(new THREE.SphereGeometry(.15, 24, 16), toy(C.ringDeep)); f.scale.set(1.2, .6, 1.4); f.position.set(x, -1.28, .12); body.add(f); return f; }
  foot(-.32); foot(.22);
  const legL = new THREE.Mesh(new THREE.CapsuleGeometry(.055, .12, 4, 10), toy(C.ringDeep)); legL.position.set(-.3, -1.15, .05); body.add(legL);
  const legR = legL.clone(); legR.position.x = .2; body.add(legR);

  /* 들고 있는 소품: 원화 동전 · 예산서 */
  const coin = new THREE.Group(); coin.visible = false;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, .06, 40), toy(C.gold, { metalness: .7, roughness: .25 })); disc.rotation.x = Math.PI / 2; coin.add(disc);
  const w1 = new THREE.Mesh(new THREE.TorusGeometry(.12, .018, 6, 24, Math.PI), new THREE.MeshStandardMaterial({ color: 0x9a6a14 })); w1.position.z = .035; coin.add(w1);
  coin.position.set(1.5, -.38, .3); body.add(coin);
  const doc = new THREE.Group(); doc.visible = false;
  const paper = new THREE.Mesh(new THREE.BoxGeometry(.42, .54, .03), toy(0xfaf7ef, { roughness: .8, clearcoat: 0 })); doc.add(paper);
  for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(i === 0 ? .26 : .3, .03, .01), new THREE.MeshBasicMaterial({ color: i === 0 ? 0x1d3a6b : 0xb9b3a4 })); l.position.set(i === 0 ? -.03 : 0, .16 - i * .1, .02); doc.add(l); }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(.08, .12, .01), new THREE.MeshBasicMaterial({ color: 0x3e9d63 })); bar.position.set(.1, -.18, .02); doc.add(bar);
  doc.position.set(-1.52, -.36, .3); doc.rotation.z = .15; body.add(doc);

  /* 표정 */
  function setExpr(n) {
    [eyeL, eyeR].forEach(e => { e.userData.ball.visible = true; e.userData.hi.visible = true; e.userData.hi2.visible = true; e.userData.arc.visible = false; e.scale.set(1, 1, 1); e.userData.ball.position.set(0, 0, 0); });
    mouthSmile.visible = true; mouthOpen.visible = false; tongue.visible = false; mouthO.visible = false; brow.visible = false;
    if (n === 'happy') { [eyeL, eyeR].forEach(e => { e.userData.ball.visible = e.userData.hi.visible = e.userData.hi2.visible = false; e.userData.arc.visible = true; }); mouthSmile.visible = false; mouthOpen.visible = true; tongue.visible = true; }
    if (n === 'wink') { eyeL.userData.ball.visible = eyeL.userData.hi.visible = eyeL.userData.hi2.visible = false; eyeL.userData.arc.visible = true; }
    if (n === 'wow') { [eyeL, eyeR].forEach(e => e.scale.set(1.15, 1.25, 1)); mouthSmile.visible = false; mouthO.visible = true; mouthO.scale.set(1.5, 1.7, 1); mouthO.position.x = 0; }
    if (n === 'think') { [eyeL, eyeR].forEach(e => { e.userData.ball.position.set(.03, .045, 0); }); mouthSmile.visible = false; mouthO.visible = true; mouthO.scale.set(.8, .8, 1); mouthO.position.x = .12; brow.visible = true; }
    if (n === 'talk') { mouthSmile.visible = false; mouthOpen.visible = true; }
    g.userData.expr = n;
  }
  /* 자세 */
  function setPose(n) {
    armL.rotation.set(0, 0, 0); armR.rotation.set(0, 0, 0); coin.visible = false; doc.visible = false; body.rotation.set(0, 0, 0); armL.userData.hand.visible = armR.userData.hand.visible = true;
    if (n === 'wave') { armR.rotation.z = WAVE; armR.position.set(1.1, -.12, .04); }
    if (n === 'point') { armR.rotation.z = .75; body.rotation.z = -.05; }
    if (n === 'hold') { coin.visible = true; doc.visible = true; armL.rotation.z = -.15; armR.rotation.z = .15; }
    if (n === 'think') { armR.rotation.z = 2.9; armR.position.set(1.0, -.55, .3); }
    else armR.position.set(1.1, -.12, .04);
    g.userData.pose = n;
  }
  /* 가만히 있을 때 움직임: 숨쉬기 · 새싹 흔들 · 눈 깜빡 · 손 흔들기 */
  function tick(t) {                       /* 모든 움직임이 2.8초마다 정확히 되풀이된다(움직이는 그림 파일로 뽑을 때 이음새가 없게) */
    const w = Math.PI * 2 / 2.8;
    body.position.y = Math.sin(t * w) * .04;
    sprout.rotation.z = Math.sin(t * w) * .08; leafL.rotation.x = -.25 + Math.sin(t * w * 2) * .12; leafR.rotation.x = .25 - Math.sin(t * w * 2 + .6) * .12;
    const blink = (t % 2.8) > 2.62; if (g.userData.expr !== 'happy') [eyeL, eyeR].forEach(e => { if (e.userData.ball.visible) e.scale.y = blink ? .12 : (g.userData.expr === 'wow' ? 1.25 : 1); });
    if (g.userData.pose === 'wave') armR.rotation.z = WAVE + Math.sin(t * w * 4) * .25;
    if (g.userData.expr === 'talk') mouthOpen.scale.y = .5 + Math.abs(Math.sin(t * w * 5)) * .6;
  }
  setExpr('idle'); setPose('stand');
  g.userData.parts = { ring, face, sprout, handle, armL, armR };
  return { group: g, setExpr, setPose, tick };
}
