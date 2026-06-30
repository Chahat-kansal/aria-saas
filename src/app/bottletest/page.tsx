"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

const BottleScene = dynamic(
  () =>
    Promise.all([
      import("@react-three/fiber"),
      import("@react-three/drei"),
    ]).then(([{ Canvas, useFrame, useThree }, { useGLTF, Center }]) => {

      const MODEL_URL = "/models/wine.glb";
      const PRODUCTS = [{ name: "Shiraz" }, { name: "Pinot" }, { name: "Cabernet" }];
      const N = PRODUCTS.length;

      // CENTRE-TIP: bottle rests at (0,0,0) upright.
      // Swipe right → bottle tips (rotation.z → -75°) and slides out (+x), fades.
      // Swipe left  → mirrors (+rotation.z, -x).
      const EXIT_X     = 1.6;                   // px slide distance
      const EXIT_Y     = -0.3;                  // slight dip (same both dirs)
      const EXIT_ROT_Z = -(Math.PI * 5) / 12;  // ≈ -75° (right), +75° (left)
      const EXIT_ROT_Y = Math.PI;               // 180° spin for life
      const DRAG_PX    = 280;                   // px → full exit offset
      const THRESHOLD  = 60;                    // px — commit vs spring-back

      useGLTF.preload(MODEL_URL);

      const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
      const easeOut   = (t: number) => 1 - Math.pow(1 - t, 3);
      const easeInOut = (t: number) =>
        t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      // Apply tip+slide+spin pose from a normalised offset [0,1] and swipe direction.
      const applyOff = (g: any, off: number, dir: number) => {
        g.position.x =  dir * off * EXIT_X;
        g.position.y =  off * EXIT_Y;
        g.rotation.z =  dir * off * EXIT_ROT_Z;
        g.rotation.y =  dir * off * EXIT_ROT_Y;
      };

      // Snap group back to rest pose exactly (avoids float drift).
      const restGroup = (g: any) => {
        g.position.set(0, 0, 0);
        g.rotation.set(0, 0, 0);
        g.scale.set(1, 1, 1);
      };

      // Set opacity on every mesh in a group subtree.
      // Caches on g.__op so traversal is skipped when unchanged.
      const setOpacity = (g: any, o: number) => {
        if (!g || g.__op === o) return;
        g.__op = o;
        g.traverse((child: any) => {
          if (!child.isMesh) return;
          const ms = Array.isArray(child.material) ? child.material : [child.material];
          ms.forEach((m: any) => { if (m) { m.transparent = o < 1; m.opacity = o; } });
        });
      };

      type Phase = "idle" | "drag" | "spring" | "transition";

      function BottleInstances({ ref0, ref1 }: { ref0: any; ref1: any }) {
        const { scene } = useGLTF(MODEL_URL);
        const clone = useRef<any>(null);
        if (!clone.current) clone.current = scene.clone(true);
        return (
          <>
            <group ref={ref0}>
              <Center><primitive object={scene} /></Center>
            </group>
            <group ref={ref1} visible={false}>
              <Center><primitive object={clone.current} /></Center>
            </group>
          </>
        );
      }

      function Scene({ onNameChange }: { onNameChange: (n: string) => void }) {
        const { gl } = useThree();
        const ref0 = useRef<any>(null);
        const ref1 = useRef<any>(null);
        const currSlot = useRef(0);

        const getCurr = () => (currSlot.current === 0 ? ref0 : ref1).current;
        const getNxt  = () => (currSlot.current === 0 ? ref1 : ref0).current;

        const anim = useRef({
          phase: "idle" as Phase,
          t: 0,
          dragOff: 0,   // raw px offset while dragging
          startOff: 0,  // normalised offset [0,1] at drag release
          swipeDir: 0,  // +1 right, -1 left
          currIdx: 0,
          nxtIdx: 1,
        });

        useEffect(() => {
          const el = gl.domElement;
          let sx = 0, dragging = false;

          const onDown = (e: PointerEvent) => {
            const a = anim.current;
            if (a.phase === "transition" || a.phase === "spring") return;
            sx = e.clientX; dragging = true; a.dragOff = 0; a.phase = "drag";
            el.setPointerCapture(e.pointerId);
          };
          const onMove = (e: PointerEvent) => {
            if (dragging) anim.current.dragOff = e.clientX - sx;
          };
          const onUp = (e: PointerEvent) => {
            if (!dragging) return;
            dragging = false; el.releasePointerCapture(e.pointerId);
            const a = anim.current;
            const dx = a.dragOff;
            a.startOff = Math.max(-1, Math.min(1, dx / DRAG_PX));
            if (Math.abs(dx) > THRESHOLD) {
              a.swipeDir = dx > 0 ? 1 : -1;
              a.nxtIdx = ((a.currIdx - a.swipeDir) % N + N) % N;
              a.t = 0; a.phase = "transition";
            } else {
              a.t = 0; a.phase = "spring";
            }
          };

          el.addEventListener("pointerdown",   onDown);
          el.addEventListener("pointermove",   onMove);
          el.addEventListener("pointerup",     onUp);
          el.addEventListener("pointercancel", onUp);
          return () => {
            el.removeEventListener("pointerdown",   onDown);
            el.removeEventListener("pointermove",   onMove);
            el.removeEventListener("pointerup",     onUp);
            el.removeEventListener("pointercancel", onUp);
          };
        }, [gl.domElement]);

        useFrame((_, delta) => {
          const a    = anim.current;
          const curr = getCurr();
          const nxt  = getNxt();
          if (!curr || !nxt) return;

          if (a.phase === "idle") {
            // Spring all properties toward rest, fade in if we just swapped in.
            const d = 1 - Math.pow(0.0001, delta);
            curr.position.x = lerp(curr.position.x, 0, d);
            curr.position.y = lerp(curr.position.y, 0, d);
            curr.rotation.z = lerp(curr.rotation.z, 0, d);
            curr.rotation.y = lerp(curr.rotation.y, 0, d);
            curr.visible = true;
            const currOp = (curr.__op ?? 1) as number;
            setOpacity(curr, Math.min(currOp + delta / 0.18, 1));
            nxt.visible = false;

          } else if (a.phase === "drag") {
            // Live tip+slide preview proportional to drag offset.
            const dir = a.dragOff >= 0 ? 1 : -1;
            const off = Math.min(1, Math.abs(a.dragOff) / DRAG_PX);
            applyOff(curr, off, dir);
            curr.visible = true;
            setOpacity(curr, 1 - off * 0.35);
            nxt.visible = false;

          } else if (a.phase === "spring") {
            // Released sub-threshold → ease back to rest.
            a.t = Math.min(a.t + delta / 0.3, 1);
            const dir = a.startOff >= 0 ? 1 : -1;
            const off = lerp(Math.abs(a.startOff), 0, easeOut(a.t));
            applyOff(curr, off, dir);
            curr.visible = true;
            setOpacity(curr, 1 - off * 0.35);
            nxt.visible = false;
            if (a.t >= 1) { restGroup(curr); setOpacity(curr, 1); a.phase = "idle"; a.t = 0; }

          } else if (a.phase === "transition") {
            // Tip + slide + spin + fade out, then swap.
            a.t = Math.min(a.t + delta / 0.48, 1);
            const et = easeInOut(a.t);
            const off = lerp(Math.abs(a.startOff), 1, et);
            applyOff(curr, off, a.swipeDir);
            curr.visible = true;
            // Fade: full until 30%, fully gone by 85%.
            const fadeT = Math.max(0, (a.t - 0.3) / 0.55);
            setOpacity(curr, Math.max(0, 1 - fadeT));

            // Next bottle waits at rest, hidden.
            restGroup(nxt); nxt.visible = false;

            if (a.t >= 1) {
              curr.visible = false; setOpacity(curr, 0);
              // Swap slots.
              currSlot.current = currSlot.current === 0 ? 1 : 0;
              a.currIdx = a.nxtIdx; a.phase = "idle"; a.t = 0;
              // Reset old curr (now nxt): rest, opaque, hidden.
              const old = getNxt();
              if (old) { old.visible = false; restGroup(old); setOpacity(old, 1); }
              // New curr starts at opacity 0 so idle fades it in.
              const newCurr = getCurr();
              if (newCurr) { restGroup(newCurr); setOpacity(newCurr, 0); }
              onNameChange(PRODUCTS[a.currIdx].name);
            }
          }
        });

        return (
          <>
            <ambientLight intensity={0.7} />
            <directionalLight position={[5, 5, 5]} intensity={1.2} />
            <directionalLight position={[-5, 3, -5]} intensity={0.5} />
            <Suspense fallback={null}>
              <BottleInstances ref0={ref0} ref1={ref1} />
            </Suspense>
          </>
        );
      }

      function BottleTest() {
        const [name, setName] = useState(PRODUCTS[0].name);
        return (
          <div
            style={{
              width: "100%",
              height: "100dvh",
              background: "#120f0c",
              display: "flex",
              flexDirection: "column",
              userSelect: "none",
            }}
          >
            <div style={{ flex: 1 }}>
              <Canvas camera={{ position: [0, 0, 4.0], fov: 46 }}>
                <Scene onNameChange={setName} />
              </Canvas>
            </div>
            <p
              style={{
                margin: 0,
                padding: "14px 0 22px",
                textAlign: "center",
                color: "#e8d8c4",
                fontFamily: "Georgia, serif",
                fontSize: 20,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              {name}
            </p>
          </div>
        );
      }

      return { default: BottleTest };
    }),
  { ssr: false, loading: () => null }
);

export default function BottleTestPage() {
  return <BottleScene />;
}