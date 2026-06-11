'use client';
import { useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import type { VRM } from '@pixiv/three-vrm';
import { buildVisemes, Viseme } from './textToVisemes';
import { initVoice, speakAriaText, stopAriaSpeech, onSpeakStart, onSpeakEnd } from '@/lib/aria/headTTSBridge';
import type { VisemeEntry } from '@/lib/aria/headTTSBridge';

// Module-level gate: wave fires ONCE per page load, never on React remounts.
// Resets to false on every full page navigation (module re-evaluated).
let _greetingFiredThisLoad = false

// ── VRoid blendshape ↔ Oculus viseme map ─────────────────────────────────
// Used when HeadTTS WebGPU returns Oculus viseme IDs.
// Character-based textToVisemes uses the same VRoid morph names directly.
const EXPR_MAP: Record<string, string> = {
  'Fcl_MTH_A': 'aa', 'Fcl_MTH_I': 'ih', 'Fcl_MTH_U': 'ou',
  'Fcl_MTH_E': 'ee', 'Fcl_MTH_O': 'oh',
};

const BONES = {
  chest: 'J_Bip_C_Chest', upperChest: 'J_Bip_C_UpperChest',
  neck: 'J_Bip_C_Neck', head: 'J_Bip_C_Head', spine: 'J_Bip_C_Spine',
  lShoulder: 'J_Bip_L_Shoulder', rShoulder: 'J_Bip_R_Shoulder',
  lUpperArm: 'J_Bip_L_UpperArm', rUpperArm: 'J_Bip_R_UpperArm',
  lLowerArm: 'J_Bip_L_LowerArm', rLowerArm: 'J_Bip_R_LowerArm',
};

// ── Mood → VRM expression map ─────────────────────────────────────────────
const MOOD_EXPR: Record<string, { expr: string; value: number }> = {
  happy:     { expr: 'happy',     value: 0.7 },
  excited:   { expr: 'surprised', value: 0.5 },
  concerned: { expr: 'sad',       value: 0.4 },
  thinking:  { expr: 'neutral',   value: 0.0 },
  neutral:   { expr: 'neutral',   value: 0.0 },
}

// ── Mood → gesture-set rotation (Part 3) ─────────────────────────────────
const GESTURE_SETS: Record<string, string[]> = {
  happy:     ['side', 'handup', 'ok'],
  excited:   ['handup', 'thumbup', 'side'],
  concerned: ['shrug', 'side'],
  thinking:  ['index', 'side'],
  neutral:   ['side', 'index'],
}

type GestureBlendOut = {
  startMs: number; durationMs: number
  lUAz: number; rUAz: number; lUAx: number; rUAx: number; lLAx: number; rLAx: number
}

function AvatarScene({ replyText, mood, gesture }: {
  replyText: string; mood: string; gesture: string
}) {
  const groupRef = useRef(new THREE.Group());
  const vrmRef = useRef<VRM | null>(null);
  const vrmReadyRef = useRef(false);
  const frameErrorRef = useRef(false);
  const bonesRef = useRef<Record<string, THREE.Object3D>>({});
  const isTalkingRef = useRef(false);

  // ── Viseme state — supports both character-based and HeadTTS Oculus visemes
  const visemes = useRef<Viseme[]>([]);          // character-based (fallback)
  const htVisemes = useRef<VisemeEntry[]>([]);   // HeadTTS Oculus visemes (preferred)
  const talkStart = useRef<number | null>(null);
  const useHtVisemes = useRef(false);

  // ── Mood + gesture state ──────────────────────────────────────────────────
  const moodRef       = useRef<string>('neutral');
  const gestureRef    = useRef<{ name: string; end: number; mirrorLeft: boolean } | null>(null);
  const gestureIdxRef = useRef(0);  // rotates through GESTURE_SETS per mood

  // Scheduled timers for sentence-timed gestures + head nods (Part 3)
  const gestureTimersRef  = useRef<ReturnType<typeof setTimeout>[]>([]);
  const headNodEndRef     = useRef<number>(0);  // ms timestamp when active nod ends
  const gestureBlendOutRef = useRef<GestureBlendOut | null>(null);
  const sentencePlanRef   = useRef<Array<{
    msOffset: number; type: 'gesture' | 'nod'; name?: string; mirror?: boolean
  }>>([]);

  const unsubSpeakStartRef = useRef<(() => void) | null>(null);
  const unsubSpeakEndRef   = useRef<(() => void) | null>(null);

  const lastSpokenRef = useRef<string>('');
  const pendingGestureRef = useRef<string>('');
  const blinkTimer = useRef(3 + Math.random() * 2);
  const blinking = useRef(false);
  const clock = useRef(0);

  // ── Init HeadTTS voice backend (runs once, client-only) ──────────────────
  useEffect(() => {
    initVoice()
  }, [])

  // ── True unmount cleanup — stopAriaSpeech only fires when AvatarScene
  //    leaves the DOM, NOT on context loss / VRM reload cycles.
  useEffect(() => {
    return () => { stopAriaSpeech() }
  }, [])

  // ── Mood: update ref + apply expression immediately if VRM is ready ──────
  useEffect(() => {
    moodRef.current = mood
    const vrm = vrmRef.current
    if (!vrm || !vrmReadyRef.current) return
    const def = MOOD_EXPR[mood] ?? MOOD_EXPR.neutral
    // Reset all mood-driven expressions before applying new one
    vrm.expressionManager?.setValue('sad', 0)
    vrm.expressionManager?.setValue('surprised', 0)
    if (def.expr !== 'neutral' && def.value > 0) {
      vrm.expressionManager?.setValue(def.expr, def.value)
    }
  }, [mood])

  // ── Gesture: store prop-driven gesture as a hint for the next speech start.
  // Sentence-timed gestures (Part 3) fire automatically; this handles explicit
  // [gesture:X] tags from the AI response as a one-shot override.
  useEffect(() => {
    if (!gesture) return
    if (vrmReadyRef.current && talkStart.current !== null) {
      console.log(`[AriaGesture] firing ${gesture} (immediate — speech active)`)
      gestureRef.current = { name: gesture, end: Date.now() + 3500, mirrorLeft: Math.random() > 0.5 }
    } else {
      pendingGestureRef.current = gesture
    }
  }, [gesture])

  // ── VRM load (unchanged from original) ─────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const vrmLoader = new GLTFLoader();
      vrmLoader.register(p => new VRMLoaderPlugin(p));
      const gltf = await vrmLoader.loadAsync('/models/Aria.glb');
      if (cancelled) return;

      const vrm = gltf.userData.vrm as VRM;
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);
      groupRef.current.add(vrm.scene);
      vrmRef.current = vrm;

      vrm.expressionManager?.setValue('angry', 0);
      vrm.expressionManager?.setValue('sad', 0);
      vrm.expressionManager?.setValue('neutral', 1);
      vrm.update(0);
      setTimeout(() => {
        vrm.expressionManager?.setValue('neutral', 0);
        vrm.expressionManager?.setValue('happy', 0.3);
      }, 100);

      const bones: Record<string, THREE.Object3D> = {};
      vrm.scene.traverse(obj => {
        Object.entries(BONES).forEach(([k, name]) => {
          if (obj.name === name) bones[k] = obj;
        });
      });
      bonesRef.current = bones;

      // ── Procedural rest pose via VRM humanoid normalized bones ─────────
      // Applied ONCE after load, BEFORE sinusoid starts. The frame loop
      // modulates on top of these values every frame.
      const hum = vrm.humanoid
      const lUA = hum.getNormalizedBoneNode('leftUpperArm')
      const rUA = hum.getNormalizedBoneNode('rightUpperArm')
      const lLA = hum.getNormalizedBoneNode('leftLowerArm')
      const rLA = hum.getNormalizedBoneNode('rightLowerArm')
      const lH  = hum.getNormalizedBoneNode('leftHand')
      const rH  = hum.getNormalizedBoneNode('rightHand')
      if (lUA) lUA.rotation.z = -1.2          // arm down ~69°
      if (rUA) rUA.rotation.z =  1.2
      if (lLA) lLA.rotation.x =  0.25         // slight elbow bend
      if (rLA) rLA.rotation.x =  0.25
      if (lH)  lH.rotation.z  =  0.06         // relaxed wrist
      if (rH)  rH.rotation.z  = -0.06
      if (bones.head) bones.head.rotation.x = 0.12
      vrm.update(0)  // flush normalized → raw before first frame
      console.log('[AriaTalkingHead] rest pose applied')

      vrmReadyRef.current = true;

      // ── Wire speech events to isTalkingRef + gesture plan arming ─────────
      unsubSpeakStartRef.current?.();
      unsubSpeakStartRef.current = onSpeakStart(() => {
        if (isTalkingRef.current) return;
        isTalkingRef.current = true;
        // Arm sentence-timed gesture/nod plan now that AudioContext playback has started
        const plan = sentencePlanRef.current;
        sentencePlanRef.current = [];
        gestureTimersRef.current.forEach(clearTimeout);
        gestureTimersRef.current = [];
        for (const p of plan) {
          const t = setTimeout(() => {
            if (p.type === 'nod') headNodEndRef.current = Date.now() + 280;
            else if (p.name) gestureRef.current = { name: p.name, end: Date.now() + 3000, mirrorLeft: !!p.mirror };
          }, p.msOffset);
          gestureTimersRef.current.push(t);
        }
      });
      unsubSpeakEndRef.current?.();
      unsubSpeakEndRef.current = onSpeakEnd(() => {
        if (!isTalkingRef.current) return;
        gestureTimersRef.current.forEach(clearTimeout);
        gestureTimersRef.current = [];
        isTalkingRef.current = false;
      });

      // One-shot greeting wave per page load — module-level bool resets on navigation.
      if (!_greetingFiredThisLoad) {
        _greetingFiredThisLoad = true
        gestureRef.current = { name: 'greet_wave', end: Date.now() + 3000, mirrorLeft: false }
      }
    }

    load().catch(() => {});
    return () => {
      cancelled = true;
      gestureTimersRef.current.forEach(clearTimeout);
      gestureTimersRef.current = [];
      unsubSpeakStartRef.current?.(); unsubSpeakStartRef.current = null;
      unsubSpeakEndRef.current?.();   unsubSpeakEndRef.current   = null;
      vrmReadyRef.current = false;
      frameErrorRef.current = false;
      isTalkingRef.current = false;
    };
  }, []);

  // ── Speech + viseme trigger: fires when replyText changes ─────────────
  useEffect(() => {
    // Clear gesture/viseme state when reply is cleared.
    // Deliberately do NOT reset lastSpokenRef here — it must survive the '' cycle so the
    // guard below blocks a duplicate fire even if fireSpeakEnd briefly clears replyText
    // and the same text comes back (e.g. spurious StrictMode re-mount).
    if (!replyText) {
      talkStart.current = null;
      visemes.current = [];
      htVisemes.current = [];
      useHtVisemes.current = false;
      pendingGestureRef.current = '';
      gestureTimersRef.current.forEach(clearTimeout);
      gestureTimersRef.current = [];
      return;
    }

    // Guard: don't re-speak the same text (StrictMode double-fire or spurious setReply cycle).
    // lastSpokenRef is set BEFORE speakAriaText so StrictMode's second invocation sees it already set.
    if (lastSpokenRef.current === replyText) return;
    lastSpokenRef.current = replyText;

    // Build sentence gesture plan — timers armed in onSpeakStart (actual AudioContext start)
    gestureTimersRef.current.forEach(clearTimeout);
    gestureTimersRef.current = [];
    gestureIdxRef.current = 0;
    const sentences = replyText.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 3);
    let charOffset = 0;
    const curMood = moodRef.current;
    const gSet = GESTURE_SETS[curMood] ?? GESTURE_SETS.neutral;
    const plan: Array<{ msOffset: number; type: 'gesture' | 'nod'; name?: string; mirror?: boolean }> = [];
    sentences.forEach((sentence, i) => {
      const msFromStart = charOffset * 60;
      charOffset += sentence.length + 1;
      if (i > 0) plan.push({ msOffset: Math.max(100, msFromStart - 150), type: 'nod' });
      if ((i % 2 === 0) || Math.random() > 0.6) {
        const gName = gSet[gestureIdxRef.current % gSet.length];
        gestureIdxRef.current++;
        plan.push({ msOffset: Math.max(200, msFromStart + 200), type: 'gesture', name: gName, mirror: Math.random() > 0.5 });
      }
    });
    sentencePlanRef.current = plan;

    // Truncate to first 2 sentences or ≤220 chars — permanent cap covering all routes
    const truncateForSpeech = (text: string): string => {
      let count = 0; let cut = text.length
      for (let i = 0; i < text.length; i++) {
        if (/[.!?]/.test(text[i])) { count++; if (count >= 2) { cut = i + 1; break } }
      }
      return text.slice(0, Math.min(cut, 220)).trim() || text.slice(0, 220).trim()
    }

    try {
      speakAriaText(truncateForSpeech(replyText), (schedule, startMs) => {
        try {
          if (schedule && schedule.length > 0) {
            htVisemes.current = schedule;
            useHtVisemes.current = true;
          } else {
            visemes.current = buildVisemes(replyText);
            useHtVisemes.current = false;
          }
          talkStart.current = startMs;

          // Fire prop-driven gesture hint once (self-clearing)
          if (pendingGestureRef.current) {
            const gName = pendingGestureRef.current;
            pendingGestureRef.current = '';
            console.log(`[AriaGesture] firing ${gName} (speech-start)`);
            gestureRef.current = { name: gName, end: Date.now() + 3500, mirrorLeft: Math.random() > 0.5 };
          }
        } catch (e) {
          console.error('[AriaTalkingHead] speak schedule callback error', e);
        }
      });
    } catch (e) {
      console.error('[AriaTalkingHead] speakAriaText error', e);
    }
  }, [replyText]);

  // ── Frame loop ────────────────────────────────────────────────────────────
  // Execution order: mixer.update → manual bone overrides → vrm.update (LAST).
  // vrm.update runs last so spring bones and look-at process the FINAL bone
  // state after all gesture/head overrides are applied.
  useFrame((_, delta) => {
    const vrm = vrmRef.current;
    if (!vrm || !vrmReadyRef.current) return;
    try {

    clock.current += delta;
    const t = clock.current;
    const bones = bonesRef.current;
    const amplMult = isTalkingRef.current ? 1.3 : 1.0;

    // 1. Manual breathing — always active; amplitude×1.3 while speaking
    if (bones.chest) bones.chest.rotation.x = Math.sin(t * 0.8) * 0.012 * amplMult;
    if (bones.spine) bones.spine.rotation.x = Math.sin(t * 0.8) * 0.008 * amplMult;

    // 3. Head / neck sway — manual override AFTER mixer (head tracks stripped from clips)
    if (bones.head) {
      bones.head.rotation.y = Math.sin(t * 0.3) * 0.06;
      bones.head.rotation.x = Math.sin(t * 0.25) * 0.02;
    }
    if (bones.neck) {
      bones.neck.rotation.y = Math.sin(t * 0.3) * 0.03;
      bones.neck.rotation.x = -0.08;
    }

    // 4. Head nod pulses at sentence boundaries
    const nodNow = Date.now()
    if (headNodEndRef.current > nodNow && bones.head) {
      const nodProgress = 1 - (headNodEndRef.current - nodNow) / 280
      bones.head.rotation.x += Math.sin(nodProgress * Math.PI) * 0.06
    }

    // 5. Talking — additional head micro-movement while speaking
    if (isTalkingRef.current && bones.head) {
      bones.head.rotation.y += Math.sin(t * 2.5) * 0.02;
      bones.head.rotation.x += Math.sin(t * 1.8) * 0.01;
    }

    // 6. Arm control — gesture wins; blend-out eases back; breathing is fallback
    if (!gestureRef.current) {
      if (bones.lUpperArm) bones.lUpperArm.rotation.z = -1.2 + Math.sin(t * 0.8) * 0.015 * amplMult;
      if (bones.rUpperArm) bones.rUpperArm.rotation.z = 1.2  - Math.sin(t * 0.8) * 0.015 * amplMult;
    }

    // Gesture blend-out: lerp from captured end-pose toward current bone state (rest target)
    if (gestureBlendOutRef.current && !gestureRef.current) {
      const bo = gestureBlendOutRef.current
      const progress = Math.min(1, (Date.now() - bo.startMs) / bo.durationMs)
      if (progress >= 1) {
        gestureBlendOutRef.current = null
      } else {
        // After mixer.update (or breathing write), bones hold the rest target — lerp toward it
        if (bones.lUpperArm) bones.lUpperArm.rotation.z = THREE.MathUtils.lerp(bo.lUAz, bones.lUpperArm.rotation.z, progress)
        if (bones.rUpperArm) bones.rUpperArm.rotation.z = THREE.MathUtils.lerp(bo.rUAz, bones.rUpperArm.rotation.z, progress)
        if (bones.lUpperArm) bones.lUpperArm.rotation.x = THREE.MathUtils.lerp(bo.lUAx, bones.lUpperArm.rotation.x, progress)
        if (bones.rUpperArm) bones.rUpperArm.rotation.x = THREE.MathUtils.lerp(bo.rUAx, bones.rUpperArm.rotation.x, progress)
        if (bones.lLowerArm) bones.lLowerArm.rotation.x = THREE.MathUtils.lerp(bo.lLAx, bones.lLowerArm.rotation.x, progress)
        if (bones.rLowerArm) bones.rLowerArm.rotation.x = THREE.MathUtils.lerp(bo.rLAx, bones.rLowerArm.rotation.x, progress)
      }
    }

    // Active gesture — owns only upperArm/lowerArm; applied post-mixer so it wins the frame
    if (gestureRef.current) {
      const { name, end, mirrorLeft } = gestureRef.current
      const remaining = end - Date.now()
      const ua      = mirrorLeft ? bones.lUpperArm : bones.rUpperArm
      const la      = mirrorLeft ? bones.lLowerArm : bones.rLowerArm
      const uaZ_rest = mirrorLeft ? -1.2 : 1.2
      const uaZ_sign = mirrorLeft ? -1 : 1
      if (remaining <= 0) {
        // Capture current bone state and start 0.4s blend-out (no snap)
        gestureBlendOutRef.current = {
          startMs: Date.now(), durationMs: 400,
          lUAz: bones.lUpperArm?.rotation.z ?? -1.2,
          rUAz: bones.rUpperArm?.rotation.z ?? 1.2,
          lUAx: bones.lUpperArm?.rotation.x ?? 0,
          rUAx: bones.rUpperArm?.rotation.x ?? 0,
          lLAx: bones.lLowerArm?.rotation.x ?? 0,
          rLAx: bones.rLowerArm?.rotation.x ?? 0,
        }
        gestureRef.current = null
      } else {
        const total   = 3000
        const elapsed = total - remaining
        const easeIn  = Math.min(1, elapsed / 400)
        const easeOut = Math.min(1, remaining / 400)
        const blend   = easeIn * easeOut
        switch (name) {
          case 'handup':
          case 'thumbup':
            if (ua) ua.rotation.z = THREE.MathUtils.lerp(uaZ_rest, uaZ_sign * 0.35, blend)
            if (la) la.rotation.x = THREE.MathUtils.lerp(0, -0.4, blend)
            break
          case 'shrug':
            if (bones.lUpperArm) bones.lUpperArm.rotation.z = THREE.MathUtils.lerp(-1.2, -0.8, blend)
            if (bones.rUpperArm) bones.rUpperArm.rotation.z = THREE.MathUtils.lerp(1.2, 0.8, blend)
            break
          case 'greet_wave':
            // Arm raised, forearm oscillates — guaranteed one-shot, never loops
            if (ua) ua.rotation.z = THREE.MathUtils.lerp(uaZ_rest, uaZ_sign * 0.30, blend)
            if (la) la.rotation.x = THREE.MathUtils.lerp(0, -0.45 + Math.sin(Date.now() / 1000 * 2.5) * 0.40, blend)
            break
          case 'index':
            if (ua) ua.rotation.x = THREE.MathUtils.lerp(0, -0.35, blend)
            if (ua) ua.rotation.z = THREE.MathUtils.lerp(uaZ_rest, uaZ_sign * 0.6, blend)
            break
          default: // side, ok
            if (ua) ua.rotation.z = THREE.MathUtils.lerp(uaZ_rest, uaZ_sign * 0.55, blend)
            break
        }
      }
    }

    // Blink
    blinkTimer.current -= delta;
    if (blinkTimer.current <= 0 && !blinking.current) {
      blinking.current = true;
      vrm.expressionManager?.setValue('blink', 1);
      setTimeout(() => { vrm.expressionManager?.setValue('blink', 0); blinking.current = false; }, 120);
      blinkTimer.current = 2.5 + Math.random() * 2.5;
    }

    // Mood-aware smile (mood prop overrides default idle smile)
    const curMood = moodRef.current
    const moodSmile = (curMood === 'happy' || curMood === 'excited')
      ? 0.7
      : curMood === 'concerned'
        ? 0.05
        : (isTalkingRef.current || talkStart.current !== null ? 0.4 : 0.25)
    vrm.expressionManager?.setValue('happy', moodSmile);
    vrm.expressionManager?.setValue('sad',       curMood === 'concerned' ? 0.4 : 0);
    vrm.expressionManager?.setValue('surprised',  curMood === 'excited'   ? 0.4 : 0);

    // ── Lip sync ─────────────────────────────────────────────────────────
    // Reset all mouth morphs
    ['aa','ih','ou','ee','oh'].forEach(e => vrm.expressionManager?.setValue(e, 0));

    if (talkStart.current !== null) {
      const elapsed = (Date.now() - talkStart.current) / 1000;

      if (useHtVisemes.current && htVisemes.current.length > 0) {
        // ── HeadTTS Oculus visemes (WebGPU path) ─────────────────────────
        const cur = htVisemes.current.find(v => elapsed >= v.start && elapsed < v.end);
        if (cur && cur.morph) {
          vrm.expressionManager?.setValue(cur.morph, cur.value);
        }
      } else if (visemes.current.length > 0) {
        // ── Character-based visemes (fallback) ────────────────────────────
        const cur = visemes.current.find(v => elapsed >= v.start && elapsed < v.end);
        if (cur && cur.morph !== 'Fcl_MTH_Close') {
          const expr = EXPR_MAP[cur.morph];
          if (expr) vrm.expressionManager?.setValue(expr, cur.value);
        }
      }

      // Safety fallback: close lips if viseme schedule ended long ago with no onSpeakEnd signal.
      // onSpeakEnd (source.ended) is authoritative — this only fires in error/hang cases.
      const maxEnd = useHtVisemes.current
        ? (htVisemes.current[htVisemes.current.length - 1]?.end ?? 0)
        : (visemes.current[visemes.current.length - 1]?.end ?? 0);
      if (elapsed > maxEnd + 5.0) {
        talkStart.current = null;
      }
    }

    // 8. VRM update LAST — runs spring bones + look-at against the fully-overridden bone state
    vrm.update(delta);

    } catch (e) {
      if (!frameErrorRef.current) {
        frameErrorRef.current = true;
        console.error('[AriaTalkingHead] frame error (suppressed after first):', e instanceof Error ? e.message : e);
      }
    }
  });

  return <primitive object={groupRef.current} />;
}

export default function AriaTalkingHead({
  replyText = '', mood = 'neutral', gesture = '',
}: {
  mode?: string; replyText?: string; mood?: string; gesture?: string
}) {
  return (
    <Canvas
      camera={{ position: [0, 1.1, 1.8], fov: 30 }}
      style={{ width: '100%', height: '100%', background: 'transparent' }}
      gl={{ alpha: true, antialias: false, powerPreference: 'default' }}
      onCreated={({ camera, gl }) => {
        camera.lookAt(0, 1.2, 0)
        gl.setClearColor(0x000000, 0)
        gl.setPixelRatio(Math.min(devicePixelRatio, 1.5))
        gl.domElement.addEventListener('webglcontextlost', (e: Event) => {
          e.preventDefault()
          console.warn('[AriaTalkingHead] WebGL context lost — will restore when available')
        }, false)
        gl.domElement.addEventListener('webglcontextrestored', () => {
          console.log('[AriaTalkingHead] WebGL context restored — reinitialising renderer state')
          gl.setClearColor(0x000000, 0)
          gl.setPixelRatio(Math.min(devicePixelRatio, 1.5))
        }, false)
      }}
    >
      <ambientLight intensity={1.4} />
      <directionalLight position={[1, 2, 2]} intensity={1.0} />
      <AvatarScene replyText={replyText} mood={mood} gesture={gesture} />
    </Canvas>
  );
}
