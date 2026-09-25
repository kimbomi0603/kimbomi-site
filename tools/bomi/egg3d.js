/* 계란 봄이 3D — 계란 몸 + 새싹 머리 + 돋보기를 든 손 + 운동화. three.js 기본 도형만으로.
   buildEgg(THREE) → { group, setExpr(name), setPose(name), tick(t) }
   표정: idle · happy · think · wow · wink · talk      자세: stand · wave · look(돋보기로 들여다보기) · point · think · hold · bow */
export function buildEgg(THREE, opt = {}) {
  const C = Object.assign({ shell: 0xf7e6c6, shellShade: 0xeed8b4, ink: 0x1b1c20, cheek: 0xf6a596, leafA: 0x2e8b53, leafB: 0x4fae62, stem: 0x23693f,
    navy: 0x16305a, gold: 0xe0a43c, sole: 0xffffff, scarf: 0x0f5a4a }, opt.colors || {});
  const toy = (color, extra = {}) => new THREE.MeshPhysicalMaterial(Object.assign({ color, roughness: .4, metalness: 0, clearcoat: .5, clearcoatRoughness: .3 }, extra));
  const g = new THREE.Group(); const body = new THREE.Group(); g.add(body);

  /* 계란 몸 — 위가 조금 좁은 달걀꼴 */
  const pts = []; const H = 1.32;
  for (let i = 0; i <= 64; i++) { const t = i / 64 * Math.PI; const y = -Math.cos(t) * H; const r = Math.sin(t) * 1.0 * (1 - 0.13 * y / H); pts.push(new THREE.Vector2(Math.max(r, 0.0001), y)); }
  const egg = new THREE.Mesh(new THREE.LatheGeometry(pts, 96), toy(C.shell, { roughness: .5, clearcoat: .3, clearcoatRoughness: .45, sheen: .3, sheenColor: new THREE.Color(0xfff1d8) }));
  egg.position.y = .12; body.add(egg);

  /* 초록 목도리(김보미.com 초록) */
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(.95, .1, 16, 80), toy(C.scarf, { roughness: .7, clearcoat: .1 }));
  scarf.visible = false; scarf.rotation.x = Math.PI / 2; scarf.position.y = -.27; scarf.scale.set(1, 1, .9); body.add(scarf);
  const knot = new THREE.Mesh(new THREE.SphereGeometry(.1, 20, 14), toy(C.scarf, { roughness: .7, clearcoat: .1 })); knot.visible = false; knot.scale.set(1.2,1,.8); knot.position.set(.42, -.3, .88); body.add(knot);
  const tail = new THREE.Mesh(new THREE.CapsuleGeometry(.06, .22, 4, 10), toy(C.scarf, { roughness: .7, clearcoat: .1 })); tail.position.set(.5, -.5, .86); tail.rotation.z = .3; tail.visible = false; body.add(tail); const tail2 = tail.clone(); tail2.position.set(.33, -.52, .9); tail2.rotation.z = -.15; tail2.visible = false; body.add(tail2);

  /* 얼굴 */
  const F = new THREE.Group(); F.position.set(0, .3, 0); body.add(F);
  const ink = new THREE.MeshStandardMaterial({ color: C.ink, roughness: .25 }); const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const zOn = (x, y) => { // 달걀 겉면 위의 z
    const yy = (y + F.position.y - .12) / H; const r = Math.sqrt(Math.max(0, 1 - yy * yy)) * (1 - .13 * yy); return Math.sqrt(Math.max(0, r * r - x * x));
  };
  function eye(x) {
    const e = new THREE.Group(); e.position.set(x, .12, zOn(x, .12) - .01);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(.13, 32, 24), ink); ball.scale.set(1, 1.25, .5); e.add(ball);
    const hi = new THREE.Mesh(new THREE.SphereGeometry(.034, 16, 12), white); hi.position.set(.038, .06, .06); e.add(hi);
    const hi2 = new THREE.Mesh(new THREE.SphereGeometry(.015, 12, 8), white); hi2.position.set(-.035, -.05, .06); e.add(hi2);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(.1, .03, 10, 24, Math.PI), ink); arc.position.set(0, -.03, .03); arc.visible = false; e.add(arc);
    e.lookAt(e.position.clone().multiplyScalar(2).setY(e.position.y)); e.userData = { ball, hi, hi2, arc }; F.add(e); return e;
  }
  const eyeL = eye(-.3), eyeR = eye(.3);
  function cheek(x) { const m = new THREE.Mesh(new THREE.SphereGeometry(.1, 24, 16), new THREE.MeshStandardMaterial({ color: C.cheek, roughness: .9, transparent: true, opacity: .8 })); m.scale.set(1.3, .7, .2); m.position.set(x, -.08, zOn(x, -.08) + .005); m.lookAt(m.position.clone().multiplyScalar(2).setY(m.position.y)); F.add(m); }
  cheek(-.52); cheek(.52);
  const mz = zOn(0, -.08) + .012;
  const mouthSmile = new THREE.Mesh(new THREE.TorusGeometry(.11, .026, 10, 30, Math.PI * .9), ink); mouthSmile.rotation.z = Math.PI * 1.05; mouthSmile.position.set(0, -.04, mz); F.add(mouthSmile);
  const mouthOpen = new THREE.Mesh(new THREE.CircleGeometry(.14, 32, Math.PI, Math.PI), new THREE.MeshStandardMaterial({ color: 0x7a2424, roughness: .6, side: THREE.DoubleSide })); mouthOpen.position.set(0, -.03, mz + .015); mouthOpen.visible = false; F.add(mouthOpen);
  const tongue = new THREE.Mesh(new THREE.SphereGeometry(.055, 16, 12), new THREE.MeshStandardMaterial({ color: 0xf08a7e })); tongue.scale.set(1.3, .55, .3); tongue.position.set(0, -.13, mz + .02); tongue.visible = false; F.add(tongue);
  const mouthO = new THREE.Mesh(new THREE.TorusGeometry(.05, .022, 10, 24), ink); mouthO.position.set(.02, -.1, mz); mouthO.visible = false; F.add(mouthO);
  const brow = new THREE.Mesh(new THREE.CapsuleGeometry(.018, .11, 4, 8), ink); brow.rotation.z = Math.PI / 2 + .35; brow.position.set(.31, .38, zOn(.31, .38)); brow.visible = false; F.add(brow);

  /* 새싹 */
  const sprout = new THREE.Group(); sprout.position.set(0, .12 + H - .03, 0); body.add(sprout);
  const stem = new THREE.Mesh(new THREE.CapsuleGeometry(.045, .2, 6, 12), toy(C.stem)); stem.position.y = .1; sprout.add(stem);
  function leaf(color, side) {
    const s = new THREE.Shape(); s.moveTo(0, 0); s.bezierCurveTo(.2, .14, .5, .14, .7, 0); s.bezierCurveTo(.5, -.11, .2, -.11, 0, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: .04, bevelEnabled: true, bevelThickness: .03, bevelSize: .03, bevelSegments: 4, curveSegments: 24 }); geo.translate(0, 0, -.02);
    const m = new THREE.Mesh(geo, toy(color, { roughness: .6, clearcoat: .15 })); m.position.y = .2; m.rotation.z = side > 0 ? .5 : Math.PI - .5; m.rotation.x = side * .25;
    const vein = new THREE.Mesh(new THREE.CapsuleGeometry(.008, .45, 2, 6), new THREE.MeshStandardMaterial({ color: 0xd9f2c9 })); vein.rotation.z = Math.PI / 2; vein.position.set(.34, 0, .055); m.add(vein);
    sprout.add(m); return m;
  }
  const leafL = leaf(C.leafA, -1), leafR = leaf(C.leafB, 1);
  const leafM = leaf(0x3f9e5a, 1); leafM.scale.setScalar(.72); leafM.position.y = .26; leafM.rotation.set(-.35, 0, 1.4); leafM.position.z = .03;
  sprout.scale.setScalar(1.35);

  /* 팔 — 계란색 짧은 팔 + 남색 장갑 */
  const SH = { L: new THREE.Vector3(-.9, -.12, .05), R: new THREE.Vector3(.9, -.12, .05) };
  function arm(side) {
    const a = new THREE.Group(); a.position.copy(side < 0 ? SH.L : SH.R);
    const up = new THREE.Mesh(new THREE.CylinderGeometry(.085, .085, 1, 16), toy(C.shellShade, { roughness: .45 })); a.add(up);
    const j = new THREE.Mesh(new THREE.SphereGeometry(.085, 16, 12), up.material); a.add(j);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(.13, 24, 16), toy(C.navy, { roughness: .5 })); a.add(hand);
    a.userData = { up, hand }; body.add(a); return a;
  }
  // 손 위치(body 좌표)로 팔을 겨눈다
  function aim(a, P) {
    const v = P.clone().sub(a.position), len = Math.max(v.length(), .05);
    a.userData.up.position.copy(v.clone().multiplyScalar(.5)); a.userData.up.scale.set(1, len, 1);
    a.userData.up.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize());
    a.userData.hand.position.copy(v);
  }
  const armL = arm(-1), armR = arm(1);

  /* 돋보기 — 오른손에 든다 */
  const mag = new THREE.Group();
  const mring = new THREE.Mesh(new THREE.TorusGeometry(.34, .06, 20, 64), toy(C.navy, { roughness: .3 })); mag.add(mring);
  const mgold = new THREE.Mesh(new THREE.TorusGeometry(.285, .018, 10, 64), toy(C.gold, { metalness: .5, roughness: .3 })); mgold.position.z = .03; mag.add(mgold);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(.29, 48), new THREE.MeshPhysicalMaterial({ color: 0xdff1ff, roughness: .05, metalness: 0, transmission: .9, thickness: .05, transparent: true, opacity: .35, clearcoat: 1 })); mag.add(lens);
  const glint = new THREE.Mesh(new THREE.TorusGeometry(.2, .018, 8, 30, Math.PI * .45), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .8 })); glint.position.z = .02; glint.rotation.z = Math.PI * .6; mag.add(glint);
  const mh = new THREE.Group(); mh.position.set(0, -.34, 0); mag.add(mh);
  const mcol = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .09, 24), toy(C.gold, { metalness: .5, roughness: .3 })); mcol.position.y = -.04; mh.add(mcol);
  const mgrip = new THREE.Mesh(new THREE.CapsuleGeometry(.06, .34, 6, 16), toy(C.navy, { roughness: .45 })); mgrip.position.y = -.28; mh.add(mgrip);
  mag.userData = { lens }; mag.scale.setScalar(1.55);
  body.add(mag);

  /* 다리와 운동화 */
  function shoe(x) {
    const s = new THREE.Group(); s.position.set(x, -1.28, .08);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.075, .3, 4, 10), toy(C.gold, { roughness: .5, clearcoat: .2 })); leg.position.y = .22; s.add(leg);
    const up = new THREE.Mesh(new THREE.SphereGeometry(.2, 24, 16), toy(C.navy, { roughness: .5 })); up.scale.set(1, .62, 1.45); up.position.set(0, 0, .05); s.add(up);
    const sole = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .06, 32), toy(C.sole, { roughness: .6 })); sole.scale.set(1.03, 1, 1.5); sole.position.set(0, -.1, .05); s.add(sole);
    const lace = new THREE.Mesh(new THREE.BoxGeometry(.16, .02, .05), new THREE.MeshBasicMaterial({ color: 0xffffff })); lace.position.set(0, .1, .2); lace.rotation.x = -.5; s.add(lace);
    body.add(s); return s;
  }
  const shoes = [shoe(-.3), shoe(.3)];

  /* 예산서 (hold 자세) */
  const doc = new THREE.Group(); doc.visible = false;
  doc.add(new THREE.Mesh(new THREE.BoxGeometry(.4, .52, .03), toy(0xfaf7ef, { roughness: .8, clearcoat: 0 })));
  for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(i === 0 ? .24 : .28, .03, .01), new THREE.MeshBasicMaterial({ color: i === 0 ? 0x16305a : 0xb9b3a4 })); l.position.set(i === 0 ? -.03 : 0, .15 - i * .1, .02); doc.add(l); }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(.08, .12, .01), new THREE.MeshBasicMaterial({ color: 0x2e8b53 })); bar.position.set(.1, -.17, .02); doc.add(bar);
  body.add(doc);

  /* 몸통을 살짝 띄워 다리가 보이게 */
  const U = new THREE.Group(); U.position.y = .2;
  body.children.slice().forEach(c => { if (!shoes.includes(c)) U.add(c); }); body.add(U);

  function setExpr(n) {
    [eyeL, eyeR].forEach(e => { e.userData.ball.visible = e.userData.hi.visible = e.userData.hi2.visible = true; e.userData.arc.visible = false; e.scale.set(1, 1, 1); e.userData.ball.position.set(0, 0, 0); });
    mouthSmile.visible = true; mouthOpen.visible = tongue.visible = mouthO.visible = brow.visible = false;
    if (n === 'happy') { [eyeL, eyeR].forEach(e => { e.userData.ball.visible = e.userData.hi.visible = e.userData.hi2.visible = false; e.userData.arc.visible = true; }); mouthSmile.visible = false; mouthOpen.visible = tongue.visible = true; }
    if (n === 'wink') { eyeL.userData.ball.visible = eyeL.userData.hi.visible = eyeL.userData.hi2.visible = false; eyeL.userData.arc.visible = true; }
    if (n === 'wow') { [eyeL, eyeR].forEach(e => e.scale.set(1.15, 1.25, 1)); mouthSmile.visible = false; mouthO.visible = true; mouthO.scale.set(1.5, 1.7, 1); mouthO.position.x = 0; }
    if (n === 'think') { [eyeL, eyeR].forEach(e => e.userData.ball.position.set(.03, .045, 0)); mouthSmile.visible = false; mouthO.visible = true; mouthO.scale.set(.8, .8, 1); mouthO.position.x = .1; brow.visible = true; }
    if (n === 'talk') { mouthSmile.visible = false; mouthOpen.visible = true; }
    if (n === 'look') { eyeR.scale.set(1.35, 1.45, 1); eyeL.scale.set(.9, .9, 1); }
    g.userData.expr = n;
  }
  // 돋보기 중심·기울기를 정하면 손이 자루 끝을 쥔다
  function placeMag(p, rotZ, rotY) {
    mag.position.copy(p); mag.rotation.set(0, rotY || 0, rotZ || 0); mag.updateMatrix();
    const grip = new THREE.Vector3(0, -.58, 0).applyMatrix4(mag.matrix); aim(armR, grip);
  }
  const REST_L = new THREE.Vector3(-1.2, -.5, .2);
  function setPose(n) {
    body.rotation.set(0, 0, 0); body.position.z = 0; doc.visible = false;
    aim(armL, REST_L);
    placeMag(new THREE.Vector3(1.5, .38, .6), -.18);
    if (n === 'look') placeMag(new THREE.Vector3(.36, .42, 1.35), .55);
    if (n === 'point') { aim(armL, new THREE.Vector3(-1.5, .45, .45)); }
    if (n === 'think') { aim(armL, new THREE.Vector3(-.42, .12, 1.02)); }
    if (n === 'hold') { doc.visible = true; doc.position.set(-.5, -.45, 1.08); doc.rotation.set(-.1, .15, .12); aim(armL, new THREE.Vector3(-.7, -.55, 1.05)); }
    if (n === 'bow') { body.rotation.x = .38; body.position.z = .15; }
    g.userData.pose = n;
  }
  function tick(t) {
    const w = Math.PI * 2 / 2.8;
    body.position.y = Math.sin(t * w) * .04;
    sprout.rotation.z = Math.sin(t * w) * .08; leafL.rotation.x = -.25 + Math.sin(t * w * 2) * .12; leafR.rotation.x = .25 - Math.sin(t * w * 2 + .6) * .12;
    const blink = (t % 2.8) > 2.62; if (g.userData.expr !== 'happy') [eyeL, eyeR].forEach(e => { if (e.userData.ball.visible) e.scale.y = blink ? .12 : (g.userData.expr === 'wow' ? 1.25 : (g.userData.expr === 'look' && e === eyeR ? 1.45 : (g.userData.expr === 'look' ? .9 : 1))); });
    if (g.userData.pose === 'wave') { const k = Math.sin(t * w * 4) * .35; aim(armL, new THREE.Vector3(-1.3 - Math.sin(k) * .35, .35 + Math.cos(k) * .1, .35)); }
    if (g.userData.expr === 'talk') mouthOpen.scale.y = .5 + Math.abs(Math.sin(t * w * 5)) * .6;
  }
  setExpr('idle'); setPose('stand');
  return { group: g, setExpr, setPose, tick };
}
