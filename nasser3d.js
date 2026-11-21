/* Zaid 3D: a piece you turn with your finger, shown at the top of the piece's details.
   window.Lamp3D.mount(container, model) -> { dispose() }.  three.js is loaded only the first time a piece is opened. */
(() => {
  "use strict";
  let threeP = null;
  // three.min.js sits next to this file
  const base = (document.currentScript && document.currentScript.src) ? document.currentScript.src.replace(/nasser3d\.js.*$/, "") : "";
  const loadThree = () => threeP || (threeP = new Promise((res, rej) => {
    if (window.THREE) return res(window.THREE);
    const s = document.createElement("script"); s.src = base + "three.min.js"; s.async = true;
    s.onload = () => window.THREE ? res(window.THREE) : rej(new Error("three")); s.onerror = rej; document.head.appendChild(s);
  }));
  // pictures are fetched and decoded once and kept, so a piece opened after preload() appears at once
  const imgs = new Map();
  const getImg = url => {
    if (!imgs.has(url)) imgs.set(url, new Promise((res, rej) => {
      const i = new Image(); i.onload = () => (i.decode ? i.decode().catch(() => {}) : Promise.resolve()).then(() => res(i)); i.onerror = rej; i.src = url;
    }));
    return imgs.get(url);
  };
  const urlsOf = M => [M.side, M.under, M.foot, M.inside, M.front, M.clay].filter(Boolean);
  function preload(M){ if (!M) return; loadThree().catch(() => {}); urlsOf(M).forEach(u => getImg(u).catch(() => {})); }
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function mount(el, M){
    let alive = true, raf = 0, renderer = null, scene = null, cam = null, ro = null, pending = 0, firstFrame = false;
    const off = [];
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); off.push(() => t.removeEventListener(ev, fn, o)); };

    // no photo first: the model itself appears (it is usually preloaded); a quiet ring shows only if it is not ready yet
    preload(M);
    const waitT = setTimeout(() => { if (alive && !firstFrame) el.classList.add("is-loading"); }, 250);

    // view: the camera orbits the piece; light stays with the viewer (from the left, like the app)
    const D0 = M.dist || 3.1, minD = D0 * .55, maxD = D0 * 1.45;   // zoom range: in to about twice the size, out a little
    const view = { yaw: M.yaw || 0, pitch: M.pitch || .12, vy: 0, vp: 0, drag: false, x: 0, y: 0, last: 0, idle: 0, auto: !reduce, dist: D0, distT: D0 };

    loadThree().then(THREE => { if (alive) build(THREE); }).catch(() => {});

    function build(THREE){
      const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(w, h, false);
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.domElement.setAttribute("aria-hidden", "true");
      renderer.domElement.style.opacity = "0"; renderer.domElement.style.transition = "opacity .3s cubic-bezier(.23,1,.32,1)";
      el.insertBefore(renderer.domElement, el.firstChild);
      scene = new THREE.Scene();
      cam = new THREE.PerspectiveCamera(26, w / h, .05, 50); scene.add(cam);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3533, .5));
      const key = new THREE.DirectionalLight(0xfff3e4, .6); key.position.set(-3.5, 3, 4); cam.add(key);
      const rim = new THREE.DirectionalLight(0xdff3ef, .22); rim.position.set(3, 1.5, -2); cam.add(rim);

      const tex = (url, repeat) => { pending++;
        const t = new THREE.Texture();
        getImg(url).then(img => { t.image = img; t.needsUpdate = true; pending--; }).catch(() => { pending--; });
        t.encoding = THREE.sRGBEncoding; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        if (repeat) t.wrapS = THREE.RepeatWrapping; return t; };

      const col = h => new THREE.Color(h).convertSRGBToLinear();   // colours are written as on screen
      const piece = new THREE.Group(); scene.add(piece);
      if (M.kind === "lamp"){
        // surface of revolution from the lamp's own outline (points run top -> bottom in M.profile)
        const V = (r, y) => new THREE.Vector2(r, y - .5);
        const prof = M.profile, sp = M.split || prof.length - 1;
        const metal = (map, rough) => new THREE.MeshStandardMaterial({ map, roughness: rough, metalness: .12, side: THREE.DoubleSide });
        if (M.side && !M.under){
          const st = tex(M.side, true); st.wrapS = THREE.RepeatWrapping;
          piece.add(new THREE.Mesh(new THREE.LatheGeometry(prof.slice().reverse().map(([r, y]) => V(r, y)), 192), metal(st, .5)));
        } else if (M.side){
          // rim -> widest point: the side panorama; widest point -> foot: the underside, seen when you tilt it up
          const upper = prof.slice(0, sp + 1).reverse().map(([r, y]) => V(r, y));
          const lower = prof.slice(sp).reverse().map(([r, y]) => V(r, y));
          const ut = tex(M.side, true); ut.wrapS = THREE.RepeatWrapping;
          piece.add(new THREE.Mesh(new THREE.LatheGeometry(upper, 192), metal(ut, .5)));
          const lt = tex(M.under, true);
          piece.add(new THREE.Mesh(new THREE.LatheGeometry(lower, 192), metal(lt, .55)));
        } else {
          piece.add(new THREE.Mesh(new THREE.LatheGeometry(prof.slice().reverse().map(([r, y]) => V(r, y)), 160), metal(tex(M.wrap, true), .55)));
        }
        // the inside of the neck, seen when you tilt it towards you
        const n = Math.max(2, Math.round(prof.length * M.neck));
        const inner = prof.slice(0, n).reverse().map(([r, y]) => V(r * .965, y));
        piece.add(new THREE.Mesh(new THREE.LatheGeometry(inner, 160),
          new THREE.MeshStandardMaterial({ map: tex(M.inside, true), roughness: .7, metalness: 0, side: THREE.BackSide })));
        const top = prof[0], bot = prof[prof.length - 1], nk = prof[n - 1];
        const deep = new THREE.Mesh(new THREE.CircleGeometry(nk[0] * .965, 96), new THREE.MeshBasicMaterial({ color: col(0x2b2116), side: THREE.DoubleSide }));
        deep.rotation.x = -Math.PI / 2; deep.position.y = nk[1] - .5; piece.add(deep);
        const lip = new THREE.Mesh(new THREE.RingGeometry(top[0] * .965, top[0], 160),
          new THREE.MeshStandardMaterial({ color: col(0x9a7444), roughness: .55, side: THREE.DoubleSide }));
        lip.rotation.x = -Math.PI / 2; lip.position.y = top[1] - .5 + .0005; piece.add(lip);
        const foot = new THREE.Mesh(new THREE.CircleGeometry(bot[0], 96),
          M.foot ? new THREE.MeshStandardMaterial({ map: tex(M.foot), roughness: .6, metalness: .1, side: THREE.DoubleSide })
                 : new THREE.MeshStandardMaterial({ color: col(0x8a6a42), roughness: .7, side: THREE.DoubleSide }));
        foot.rotation.x = Math.PI / 2; foot.position.y = bot[1] - .5; piece.add(foot);
        // the six suspension loops on the shoulder, standing out from the body
        if (M.handlesU){
          // the six suspension loops: small lugs standing on the shoulder, leaning out from the body
          const gold = new THREE.MeshStandardMaterial({ color: col(0xc89f68), roughness: .4, metalness: .3 });
          const loop = new THREE.TorusGeometry(.03, .0095, 12, 32);
          M.handlesU.forEach(u => {
            const phi = u * Math.PI * 2, R = M.handleR;
            const h = new THREE.Mesh(loop, gold);
            h.position.set(Math.sin(phi) * (R + .012), M.handleY - .5, Math.cos(phi) * (R + .012));
            h.rotation.order = "YXZ"; h.rotation.set(-.6, phi, 0);
            piece.add(h);
          });
        }
      } else {
        // a glazed tile: the photographed face on the front, fired clay on the edges and back.
        // With an outline, the slab follows the tile's own chipped, slightly uneven edge and has softly rounded arrises.
        const H = 1, W = M.aspect, D = M.depth || .024, bv = M.outline ? Math.min(.004, D * .18) : 0;
        const clayMap = M.clay ? tex(M.clay, true) : null;
        const clay = new THREE.MeshStandardMaterial(clayMap ? { map: clayMap, roughness: .95 } : { color: col(0xd9ccb3), roughness: .95 });
        const back = new THREE.MeshStandardMaterial(clayMap ? { map: clayMap, color: col(0xe6e0d4), roughness: 1 } : { color: col(0xc9baa0), roughness: 1 });
        const glazeOpts = { map: tex(M.front), roughness: .32, metalness: 0 };
        const face = THREE.MeshPhysicalMaterial ? new THREE.MeshPhysicalMaterial(Object.assign({ clearcoat: .7, clearcoatRoughness: .22 }, glazeOpts))
                                                : new THREE.MeshStandardMaterial(glazeOpts);
        if (M.outline){
          const shape = new THREE.Shape(M.outline.map(([x, y]) => new THREE.Vector2(x, y)));
          const body = new THREE.ExtrudeGeometry(shape, { depth: D, steps: 1, curveSegments: 1, bevelEnabled: true, bevelThickness: bv, bevelSize: bv, bevelSegments: 3 });
          const front = new THREE.ShapeGeometry(shape);            // its UVs are the outline's own 0..1 coordinates
          [body, front].forEach(g => { g.translate(-.5, -.5, 0); g.scale(W, H, 1); });
          body.translate(0, 0, -D / 2); front.translate(0, 0, D / 2 + bv + .0006);
          // back: either fired clay, or (as in the museum scan) the decorated face seen through from behind, i.e. mirrored
          piece.add(new THREE.Mesh(body, [M.back === "mirror" ? face : back, clay]));
          piece.add(new THREE.Mesh(front, face));
        } else {
          piece.add(new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [clay, clay, clay, clay, face, back]));
        }
      }

      const fit = () => { if (!renderer) return; const W2 = Math.max(1, el.clientWidth), H2 = Math.max(1, el.clientHeight);
        renderer.setSize(W2, H2, false); cam.aspect = W2 / H2; cam.updateProjectionMatrix(); };
      if (window.ResizeObserver){ ro = new ResizeObserver(fit); ro.observe(el); }

      // drag to turn (sideways) and tilt (up and down); a flick keeps turning and settles
      const c = renderer.domElement; c.style.touchAction = "none";
      // one finger / the mouse turns and tilts; two fingers pinch to zoom; the wheel (or a trackpad pinch) zooms too
      const pts = new Map(); let pinch = null;
      const spread = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
      const stopAuto = () => { view.auto = false; view.idle = performance.now(); };
      on(c, "pointerdown", e => {
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); try{ c.setPointerCapture(e.pointerId); }catch(err){}
        stopAuto(); view.vy = view.vp = 0;
        if (pts.size === 2){ pinch = { d0: spread(), dist0: view.distT }; view.drag = false; el.classList.remove("grabbing"); return; }
        if (pts.size === 1){ view.drag = true; view.x = e.clientX; view.y = e.clientY; el.classList.add("grabbing"); }
      });
      on(c, "pointermove", e => {
        if (!pts.has(e.pointerId)) return;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinch && pts.size >= 2){ view.distT = clamp(pinch.dist0 * pinch.d0 / spread(), minD, maxD); return; }
        if (!view.drag) return;
        const dx = e.clientX - view.x, dy = e.clientY - view.y; view.x = e.clientX; view.y = e.clientY;
        const k = 3.2 / Math.max(240, el.clientWidth);
        view.yaw -= dx * k; view.pitch = clamp(view.pitch + dy * k * .8, M.minPitch ?? -.45, M.maxPitch ?? .95);
        view.vy = clamp(-dx * k, -.06, .06); view.vp = clamp(dy * k * .8, -.03, .03);
      });
      const up = e => {
        pts.delete(e.pointerId);
        if (pts.size < 2) pinch = null;
        if (pts.size === 1){ const p = [...pts.values()][0]; view.drag = true; view.x = p.x; view.y = p.y; view.vy = view.vp = 0; return; }   // back to turning with the finger that stayed
        if (pts.size === 0){ view.drag = false; view.idle = performance.now(); el.classList.remove("grabbing"); }
      };
      on(c, "pointerup", up); on(c, "pointercancel", up); on(c, "lostpointercapture", up);
      on(c, "wheel", e => { e.preventDefault(); stopAuto(); view.distT = clamp(view.distT * Math.exp(e.deltaY * (e.ctrlKey ? .01 : .0015)), minD, maxD); }, { passive: false });

      let t0 = performance.now();
      const tick = now => {
        if (!alive) return;
        const dt = Math.min(50, now - t0) / 16.67; t0 = now;
        if (!view.drag){
          view.yaw += view.vy * dt; view.pitch = clamp(view.pitch + view.vp * dt, M.minPitch ?? -.45, M.maxPitch ?? .95);
          view.vy *= Math.pow(.93, dt); view.vp *= Math.pow(.85, dt);
          if (!reduce && !view.auto && view.idle && now - view.idle > 6000) view.auto = true;     // back to a slow turn after a pause
          if (view.auto) view.yaw += .0035 * dt;
        }
        view.dist += (view.distT - view.dist) * Math.min(1, .25 * dt);   // zoom eases to where the fingers asked
        const cp = Math.cos(view.pitch);
        cam.position.set(Math.sin(view.yaw) * cp * view.dist, Math.sin(view.pitch) * view.dist, Math.cos(view.yaw) * cp * view.dist);
        cam.lookAt(0, M.lookY || 0, 0);
        if (!document.hidden) renderer.render(scene, cam);
        if (!firstFrame && pending === 0){ firstFrame = true; clearTimeout(waitT); el.classList.remove("is-loading"); renderer.domElement.style.opacity = "1"; }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    return { dispose(){
      alive = false; cancelAnimationFrame(raf); off.forEach(f => f()); if (ro) ro.disconnect();
      if (scene) scene.traverse(o => { if (o.geometry) o.geometry.dispose(); const ms = o.material ? [].concat(o.material) : [];
        ms.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); });
      if (renderer){ renderer.dispose(); try{ renderer.forceContextLoss(); }catch(e){} renderer.domElement.remove(); }
      clearTimeout(waitT); el.classList.remove("is-loading");
    } };
  }
  window.Lamp3D = { mount, preload };
})();
