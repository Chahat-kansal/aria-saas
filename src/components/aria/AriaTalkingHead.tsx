'use client';
import { useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { createVRMAnimationClip, VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation';
import type { VRM } from '@pixiv/three-vrm';
import { buildVisemes, Viseme } from './textToVisemes';
import { initVoice, speakAriaText, stopAriaSpeech } from '@/lib/aria/headTTSBridge';
import type { VisemeEntry } from '@/lib/aria/headTTSBridge';

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

function AvatarScene({ mode, replyText, mood, gesture }: {
  mode: string; replyText: string; mood: string; gesture: string
}) {
  const groupRef = useRef(new THREE.Group());
  const vrmRef = useRef<VRM | null>(null);
  const vrmReadyRef = useRef(false);
  const frameErrorRef = useRef(false);
  const bonesRef = useRef<Record<string, THREE.Object3D>>({});
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const greetingDone = useRef(false);

  // ── Viseme state — supports both character-based and HeadTTS Oculus visemes
  const visemes = useRef<Viseme[]>([]);          // character-based (fallback)
  const htVisemes = useRef<VisemeEntry[]>([]);   // HeadTTS Oculus visemes (preferred)
  const talkStart = useRef<number | null>(null);
  const useHtVisemes = useRef(false);

  // ── Mood + gesture state ──────────────────────────────────────────────────
  const moodRef    = useRef<string>('neutral');
  const gestureRef = useRef<{ name: string; end: number } | null>(null);

  const lastSpokenRef = useRef<string>('');
  const blinkTimer = useRef(3 + Math.random() * 2);
  const blinking = useRef(false);
  const clock = useRef(0);

  // ── Init HeadTTS voice backend (runs once, client-only) ──────────────────
  useEffect(() => {
    initVoice()
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

  // ── Gesture: start a 3-second arm animation ───────────────────────────────
  useEffect(() => {
    if (!gesture) return
    gestureRef.current = { name: gesture, end: Date.now() + 3000 }
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

      if (bones.head) bones.head.rotation.x = 0.12;
      if (bones.lUpperArm) bones.lUpperArm.rotation.z = -1.2;
      if (bones.rUpperArm) bones.rUpperArm.rotation.z = 1.2;
      if (bones.lLowerArm) bones.lLowerArm.rotation.z = -0.2;
      if (bones.rLowerArm) bones.rLowerArm.rotation.z = 0.2;

      vrmReadyRef.current = true;

      try {
        const vrmaLoader = new GLTFLoader();
        vrmaLoader.register(p => new VRMAnimationLoaderPlugin(p));
        const a02 = await vrmaLoader.loadAsync('/models/VRMA_02.vrma');
        if (cancelled) return;

        const vrmaGreet = a02.userData.vrmAnimations?.[0];
        if (vrmaGreet) {
          const mixer = new THREE.AnimationMixer(vrm.scene);
          mixerRef.current = mixer;
          const clip = createVRMAnimationClip(vrmaGreet, vrm);
          const action = mixer.clipAction(clip);
          action.setLoop(THREE.LoopOnce, 1);
          action.play();
          setTimeout(() => {
            greetingDone.current = true;
            mixerRef.current = null;
            if (bones.head) { bones.head.rotation.set(0, 0, 0); }
            if (bones.neck) { bones.neck.rotation.set(-0.08, 0, 0); }
            if (bones.chest) { bones.chest.rotation.set(-0.05, 0, 0); }
            if (bones.spine) { bones.spine.rotation.set(-0.03, 0, 0); }
            if (bones.lUpperArm) bones.lUpperArm.rotation.z = -1.2;
            if (bones.rUpperArm) bones.rUpperArm.rotation.z = 1.2;
          }, 7267);
        } else {
          greetingDone.current = true;
        }
      } catch { greetingDone.current = true; }
    }

    load().catch(() => { greetingDone.current = true; });
    return () => {
      cancelled = true;
      vrmReadyRef.current = false;
      frameErrorRef.current = false;
      stopAriaSpeech();
    };
  }, []);

  // ── Speech + viseme trigger: fires when replyText changes ─────────────
  useEffect(() => {
    if (!replyText) {
      // Clear lip-sync state — do NOT call stopAriaSpeech() here; the bridge
      // manages lifecycle and fires onSpeakEnd when audio actually finishes.
      lastSpokenRef.current = '';
      talkStart.current = null;
      visemes.current = [];
      htVisemes.current = [];
      useHtVisemes.current = false;
      return;
    }

    // Guard: don't re-speak the same text (React StrictMode double-fires effects)
    if (replyText === lastSpokenRef.current) return;
    lastSpokenRef.current = replyText;

    // Start speaking. Callback fires once per streaming chunk (or once for generate).
    // Each call updates htVisemes.current with the accumulated schedule so far;
    // talkStart is set on the first call and remains stable for subsequent chunks.
    speakAriaText(replyText, (schedule, startMs) => {
      if (schedule && schedule.length > 0) {
        htVisemes.current = schedule;
        useHtVisemes.current = true;
      } else {
        visemes.current = buildVisemes(replyText);
        useHtVisemes.current = false;
      }
      // Only update talkStart on first callback (startMs stays constant across chunks)
      if (talkStart.current === null) {
        talkStart.current = startMs;
      }
    });
    // No cleanup stopAriaSpeech() — the unmount effect (VRM load) handles that.
  }, [replyText]);

  // ── Frame loop (unchanged idle/talk/blink logic; lip-sync extended) ─────
  useFrame((_, delta) => {
    const vrm = vrmRef.current;
    if (!vrm || !vrmReadyRef.current) return;
    try {

    if (mixerRef.current) {
      mixerRef.current.update(delta);
      vrm.update(delta);
      return;
    }

    clock.current += delta;
    const t = clock.current;
    vrm.update(delta);
    const bones = bonesRef.current;

    // Breathing
    if (bones.chest) bones.chest.rotation.x = Math.sin(t * 0.8) * 0.012;
    if (bones.spine) bones.spine.rotation.x = Math.sin(t * 0.8) * 0.008;

    // Head sway
    if (bones.head) {
      bones.head.rotation.y = Math.sin(t * 0.3) * 0.06;
      bones.head.rotation.x = 0 + Math.sin(t * 0.25) * 0.02;
    }
    if (bones.neck) {
      bones.neck.rotation.y = Math.sin(t * 0.3) * 0.03;
      bones.neck.rotation.x = -0.08;
    }

    // Arms: breathing unless a gesture is active
    if (!gestureRef.current) {
      if (bones.lUpperArm) bones.lUpperArm.rotation.z = -1.2 + Math.sin(t * 0.8) * 0.015;
      if (bones.rUpperArm) bones.rUpperArm.rotation.z = 1.2 - Math.sin(t * 0.8) * 0.015;
    }

    // Gesture arm override
    if (gestureRef.current) {
      const { name, end } = gestureRef.current
      const remaining = end - Date.now()
      if (remaining <= 0) {
        gestureRef.current = null
        if (bones.lUpperArm) bones.lUpperArm.rotation.z = -1.2
        if (bones.rUpperArm) bones.rUpperArm.rotation.z = 1.2
        if (bones.rLowerArm) bones.rLowerArm.rotation.x = 0.0
        if (bones.rUpperArm) bones.rUpperArm.rotation.x = 0.0
      } else {
        const total = 3000
        const elapsed = total - remaining
        const easeIn  = Math.min(1, elapsed / 400)
        const easeOut = Math.min(1, remaining / 400)
        const blend   = easeIn * easeOut
        switch (name) {
          case 'handup':
          case 'thumbup':
            if (bones.rUpperArm) bones.rUpperArm.rotation.z = THREE.MathUtils.lerp(1.2, 0.35, blend)
            if (bones.rLowerArm) bones.rLowerArm.rotation.x = THREE.MathUtils.lerp(0, -0.4, blend)
            break
          case 'shrug':
            if (bones.lUpperArm) bones.lUpperArm.rotation.z = THREE.MathUtils.lerp(-1.2, -0.8, blend)
            if (bones.rUpperArm) bones.rUpperArm.rotation.z = THREE.MathUtils.lerp(1.2, 0.8, blend)
            break
          case 'index':
            if (bones.rUpperArm) bones.rUpperArm.rotation.x = THREE.MathUtils.lerp(0, -0.35, blend)
            if (bones.rUpperArm) bones.rUpperArm.rotation.z = THREE.MathUtils.lerp(1.2, 0.6, blend)
            break
          default: // side, ok
            if (bones.rUpperArm) bones.rUpperArm.rotation.z = THREE.MathUtils.lerp(1.2, 0.55, blend)
            break
        }
      }
    }

    // Talking — more movement
    if (mode === 'talking' && bones.head) {
      bones.head.rotation.y += Math.sin(t * 2.5) * 0.02;
      bones.head.rotation.x += Math.sin(t * 1.8) * 0.01;
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
        : (mode === 'talking' || talkStart.current !== null ? 0.4 : 0.25)
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

      // Clear lip-sync once the viseme schedule is exhausted
      const maxEnd = useHtVisemes.current
        ? (htVisemes.current[htVisemes.current.length - 1]?.end ?? 0)
        : (visemes.current[visemes.current.length - 1]?.end ?? 0);
      if (elapsed > maxEnd + 0.5) {
        talkStart.current = null;
      }
    }

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
  mode = 'idle', replyText = '', mood = 'neutral', gesture = '',
}: {
  mode?: string; replyText?: string; mood?: string; gesture?: string
}) {
  return (
    <Canvas
      camera={{ position: [0, 1.1, 1.8], fov: 30 }}
      style={{ width: '100%', height: '100%', background: 'transparent' }}
      gl={{ alpha: true, antialias: true }}
      onCreated={({ camera, gl }) => {
        camera.lookAt(0, 1.2, 0)
        gl.setClearColor(0x000000, 0) // transparent canvas background
        gl.domElement.addEventListener('webglcontextlost', (e: Event) => {
          e.preventDefault()
          console.warn('[AriaTalkingHead] WebGL context lost — will restore when available')
        }, false)
        gl.domElement.addEventListener('webglcontextrestored', () => {
          console.log('[AriaTalkingHead] WebGL context restored')
        }, false)
      }}
    >
      <ambientLight intensity={1.4} />
      <directionalLight position={[1, 2, 2]} intensity={1.0} />
      <AvatarScene mode={mode} replyText={replyText} mood={mood} gesture={gesture} />
    </Canvas>
  );
}
