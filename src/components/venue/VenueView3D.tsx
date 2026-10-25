'use client'
/**
 * VENUE-VIEW-1 — PRE-FLIGHT, recorded here as Phase 0 requires.
 *
 *  1. FloorPlan.tsx (583 lines) carries layoutMode:'grouped'|'canvas' and rows with pos_x, pos_y,
 *     width, height, rotation, shape, element_type, status, current_sale_id, occupied_since,
 *     seated_at, display_name, zone. NOT EDITED by this sprint — 0 lines changed.
 *  2. The only approved R3F load pattern is BottleViewer.tsx:78-82's
 *     dynamic(() => Promise.all([fiber, drei, three]).then(...), { ssr:false }). Reused in shape
 *     below; all three imports are genuinely used (Canvas, OrbitControls, raw three).
 *  3. /api/pos/tables GET already returns non-archived rows for the ACTIVE business. EXTENDED with
 *     ?venue=1 (Phase 2), not replaced, and no new route was added.
 *  4. bookings/page.tsx tab 'tables' mounts <FloorPlan layoutMode="canvas"/>; a segmented switch
 *     sits above it (Phase 3). Its onTableSelect was already a no-op, so onSelect is one too.
 *  5. Deps unchanged: @react-three/fiber ^8.18, drei ^9.122, three ^0.167, react 18.2, next ^14.2.
 *  6. DB facts CONFIRMED against production (pg_constraint, 26 Oct), not taken on trust:
 *     pos_tables_element_type_check = {table,bar,counter,kitchen,entrance,wall,plant} and
 *     pos_tables_status_check = {available,occupied,reserved,cleaning}. The brief was right.
 *     All 20 columns read below exist, occupied_since and seated_at among them.
 *  7. ⚠️ FloorPlan.tsx:9 types status as 'available'|'seated'|'ordering'|'eating'|'check'|'dirty'.
 *     Those five extra words are REJECTED BY THE CHECK CONSTRAINT — they cannot exist in a row.
 *     isBusy() still maps them, deliberately: it costs nothing and means that if the constraint is
 *     ever widened, or a legacy row is ever imported, the view cannot show a green dot over four
 *     seated guests. Today that branch is provably unreachable.
 *     ⚠️ CONSEQUENCE WORTH KNOWING BEFORE TRUSTING THE RED DOT: /api/pos/tables/[id]/seat writes
 *     status:'seated' and /clear writes status:'dirty'. Both violate the CHECK (proved: sqlstate
 *     23514, rolled back, control write of 'occupied' succeeded), so BOTH ROUTES 500 AND SEATING A
 *     TABLE HAS NEVER WORKED — all 15 of Sip's rows are 'available' with seated_at null. Since that
 *     failed UPDATE is atomic, seated_at never gets set, so the NEEDS-YOU rule below cannot fire in
 *     production until those two routes are fixed to write allowed values. PARKED, out of domain,
 *     reported URGENT in docs/aria/runs/VENUE-VIEW-1.md. The rule itself is correct and starts
 *     working the moment seat writes 'occupied' — nothing here needs to change.
 *     occupied_since is written by NO code at all; seated_at is the maintained one, which is why
 *     this file reads `occupied_since ?? seated_at` rather than either alone.
 *  8. ⚠️ The route IGNORES a business_id query param and resolves the active business from the
 *     session. So this component does NOT send one: honouring a caller-supplied business_id would
 *     be the cross-business leak RULE 7 exists for. `businessId` is used only to re-fetch.
 *  9. Look, geometry and card layout copied from docs/prototypes/venue-view-prototype.html (the
 *     brief's path said docs/aria/prototypes/ — it is docs/prototypes/). Scenario data NOT copied.
 * 10. Gotchas inherited from the prototype: no variable may be named `top` (clashes with window.top
 *     at module scope) and the canvas needs explicit 100% CSS size or it renders 300×150.
 */
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// VENUE-VIEW-1 — the pure rules live in venue-rules.ts so they can be unit-tested (see that
// file's header for why a .tsx could not be). Re-exported below: importers see one module.
import {
  PX_TO_M, T, isBusy, money, hhmm, minutesAgo,
  needsYou, dotColour, rowLabel, rowZone, seatedMinutes,
  type VenueRow, type VenueSummary,
} from './venue-rules'

export {
  PX_TO_M, needsYou, dotColour, rowLabel, rowZone, seatedMinutes, isBusy,
} from './venue-rules'
export type { VenueRow, VenueSummary } from './venue-rules'

/* ── the side card — plain React/CSS, dashboard theme ───────────────────────────────────────── */

const sTile: React.CSSProperties = {
  border: '1px solid ' + T.line, borderRadius: 12, padding: '9px 10px', minWidth: 0,
}
const sTileLabel: React.CSSProperties = {
  display: 'block', fontSize: 10, color: T.muted, marginBottom: 4,
}
const sTileValue: React.CSSProperties = {
  fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: T.text,
}
const sRow: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', gap: 12,
  padding: '8px 0', borderBottom: '1px solid ' + T.line, fontSize: 12,
}
const sPill = (kind: 'ok' | 'warn' | 'bad' | 'plain'): React.CSSProperties => ({
  fontSize: 11, fontWeight: 600, padding: '4px 9px', borderRadius: 999,
  background: kind === 'ok' ? 'rgba(127,184,151,0.14)' : kind === 'warn' ? 'rgba(201,163,122,0.16)'
    : kind === 'bad' ? 'rgba(226,75,74,0.14)' : 'rgba(255,255,255,0.06)',
  color: kind === 'ok' ? T.green : kind === 'warn' ? T.sand : kind === 'bad' ? T.red : T.muted,
})

function SourceChip({ children }: { children: string }) {
  return (
    <span style={{
      display: 'inline-block', fontSize: 9, fontWeight: 600, letterSpacing: '0.06em',
      padding: '2px 6px', borderRadius: 5, background: 'rgba(255,255,255,0.06)',
      color: T.muted, marginLeft: 6, verticalAlign: 'middle',
    }}>{children}</span>
  )
}

function Tile({ label, value, chip }: { label: string; value: string; chip?: string }) {
  return (
    <div style={sTile}>
      <small style={sTileLabel}>{label}{chip ? <SourceChip>{chip}</SourceChip> : null}</small>
      <b style={sTileValue}>{value}</b>
    </div>
  )
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div style={sRow}>
      <span style={{ color: T.muted }}>{k}</span>
      <span style={{ fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.text }}>{v}</span>
    </div>
  )
}

export function VenueCard({
  row, summary, needingCount, onSelect, onClose,
}: {
  row: VenueRow
  summary: VenueSummary | null
  /** How many tables currently satisfy the NEEDS-YOU rule, counted by the caller from the same rows. */
  needingCount: number
  onSelect?: (r: VenueRow) => void
  onClose: () => void
}) {
  const kind = (row.element_type ?? 'table').toLowerCase()
  const alert = needsYou(row)
  const mins = seatedMinutes(row)
  const busy = isBusy(row.status)
  const zone = rowZone(row)

  // A row with neither a display name nor a table number is a layout-editor leftover.
  const unnamed = !row.display_name && !row.table_number

  return (
    <div
      role="dialog"
      aria-label={rowLabel(row) + ' details'}
      style={{
        width: 'min(300px, 100%)', boxSizing: 'border-box', background: T.card,
        borderRadius: 16, border: '1px solid ' + T.line, padding: 14,
        boxShadow: '0 10px 36px rgba(0,0,0,0.38)', fontFamily: T.font, color: T.text,
        maxHeight: '100%', overflow: 'auto',
      }}
    >
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10, flex: 'none', display: 'grid',
          placeItems: 'center', fontWeight: 700, fontSize: 13,
          background: 'rgba(127,184,151,0.14)', color: T.green,
        }}>{(row.table_number ?? rowLabel(row)).slice(0, 3)}</div>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: 15, margin: 0, fontWeight: 700, lineHeight: 1.2 }}>{rowLabel(row)}</h2>
          <p style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
            {[zone, row.seats ? row.seats + ' seats' : null, row.shape].filter(Boolean).join(' · ') || '—'}
            <SourceChip>pos_tables</SourceChip>
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            marginLeft: 'auto', border: 0, background: 'transparent', color: T.muted,
            fontSize: 16, cursor: 'pointer', lineHeight: 1, padding: '2px 4px',
          }}
        >×</button>
      </div>

      {/* pills */}
      <div style={{ display: 'flex', gap: 6, margin: '10px 0 12px', flexWrap: 'wrap' }}>
        <span style={sPill(alert ? 'bad' : busy ? 'warn' : 'ok')}>{row.status ?? 'unknown'}</span>
        {zone ? <span style={sPill('plain')}>{zone}</span> : null}
      </div>

      {kind === 'table' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Tile label="Guests" value={String(row.seats ?? 0)} />
            <Tile label="Seated since" value={hhmm(row.occupied_since ?? row.seated_at)} />
            <Tile label="Sale" value={row.sale_total == null ? '—' : money(row.sale_total)} />
            <Tile label="Status" value={row.status ?? '—'} />
          </div>
          {/* Owner-legible detail only. Position, size and rotation are layout-editor concerns and
              belong in Edit layout, not on the surface the owner reads the room from. */}
          <div style={{ marginTop: 10, borderTop: '1px solid ' + T.line }}>
            <KV k="Time at table" v={mins == null ? 'unknown' : mins + ' min'} />
            <KV k="Zone" v={zone || '—'} />
            <KV k="Shape" v={row.shape ?? '—'} />
            <KV k="Open tab" v={row.sale_total == null ? 'none' : money(row.sale_total)} />
          </div>
          {alert && (
            <div style={{
              marginTop: 10, background: 'rgba(226,75,74,0.14)', color: T.red, borderRadius: 10,
              padding: '9px 10px', fontSize: 12, fontWeight: 600, lineHeight: 1.4,
            }}>
              Seated {mins} min, nothing on the sale.
            </div>
          )}
          {unnamed && (
            <p style={{ fontSize: 10, color: T.muted, marginTop: 10, lineHeight: 1.5 }}>
              Unnamed row — give it a name in the layout editor.
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              onClick={() => onSelect?.(row)}
              style={{
                flex: 1, borderRadius: 10, border: '1px solid ' + T.green,
                background: T.green, color: '#0a0f0c', padding: 9,
                font: '600 12px ' + T.font, cursor: 'pointer',
              }}
            >Open table</button>
          </div>
        </>
      )}

      {/* ⚠️ GROUNDING-TEETH: when the summary has not arrived, every figure here renders "unknown".
          `money(undefined)` would render "$0.00", which is not an absence — it is a claim that the
          day has taken nothing. */}
      {(kind === 'counter' || kind === 'bar') && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Tile label="Sales today" chip="pos_sales" value={summary ? money(summary.today_completed_total) : 'unknown'} />
          <Tile label="Completed today" value={summary ? String(summary.today_completed_count) : 'unknown'} />
          <Tile label="Open tables" value={summary ? String(summary.open_tables) : 'unknown'} />
          <Tile label="Last sale" value={summary ? minutesAgo(summary.last_completed_at) : 'unknown'} />
        </div>
      )}

      {/* The kitchen knows how many tables are live. It does NOT know an average table age — nothing
          computes one, so no tile claims one. */}
      {kind === 'kitchen' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Tile label="Open tables" value={summary ? String(summary.open_tables) : 'unknown'} />
          <Tile label="Needs attention" value={String(needingCount)} />
        </div>
      )}

      <p style={{ fontSize: 10, color: T.muted, marginTop: 10, lineHeight: 1.5 }}>
        Live from pos_tables / pos_sales. No stock or sensor data yet.
      </p>
    </div>
  )
}

/* ── the scene — three/fiber/drei exist ONLY inside this factory ────────────────────────────── */

interface HoverState { x: number; y: number; row: VenueRow }

interface SceneProps {
  rows: VenueRow[]
  onPick: (r: VenueRow | null) => void
  /** Lifted to the parent: the tooltip is DOM, and nothing inside <Canvas> may render DOM. */
  onHover: (h: HoverState | null) => void
  selectedId: string | null
  /** Increments when the owner presses Top-down. A nonce, not a boolean, so repeat presses re-aim. */
  topDownNonce: number
  /** prefers-reduced-motion: orbit damping is the only animation in here, so it is what gets cut. */
  reducedMotion: boolean
}

const VenueScene = dynamic<SceneProps>(
  () =>
    Promise.all([
      import('@react-three/fiber'),
      import('@react-three/drei'),
      import('three'),
    ]).then(([{ Canvas, useThree }, { OrbitControls }, THREE]) => {

      /**
       * ⚠️ Types derived from the VALUE binding, not from a module-scope `import type ... 'three'`.
       * `THREE` here is a namespace object, so `THREE.Mesh` is legal as a value but not as a type.
       * InstanceType<typeof …> gets the instance types without the outer module importing anything
       * from three — which is the constraint this file is held to (pre-flight note 2).
       */
      type TObject3D = InstanceType<typeof THREE.Object3D>
      type TMesh = InstanceType<typeof THREE.Mesh>
      type TGroup = InstanceType<typeof THREE.Group>
      type TMaterial = InstanceType<typeof THREE.Material>
      type TVector3 = InstanceType<typeof THREE.Vector3>
      type TTexture = InstanceType<typeof THREE.Texture>

      const C = {
        floor: 0xe7dccb, wall: 0xf6f4ef, glass: 0xb9c7d6, timber: 0x9a7352,
        timberDark: 0x6f5137, steel: 0xe9ecef, dark: 0x3a3f46,
        tree: 0x6cb04a, trunk: 0x8d6a45, pad: 0xd4d8dc, bench: 0x9aa5b1,
      }
      const GUEST_COLOURS = [0x5b7fa5, 0xd98c5f, 0x7fb897, 0xba7517]

      const mat = (c: number, o: Record<string, unknown> = {}) =>
        new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.9, metalness: 0 }, o))

      function boxAt(w: number, h: number, d: number, m: TMaterial, x = 0, y = 0, z = 0, cast = true) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
        mesh.position.set(x, y, z)
        mesh.castShadow = cast
        mesh.receiveShadow = true
        return mesh
      }
      function cylAt(r1: number, r2: number, h: number, m: TMaterial, seg = 20) {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m)
        mesh.castShadow = true
        mesh.receiveShadow = true
        return mesh
      }

      function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
        g.beginPath()
        g.moveTo(x + r, y)
        g.arcTo(x + w, y, x + w, y + h, r)
        g.arcTo(x + w, y + h, x, y + h, r)
        g.arcTo(x, y + h, x, y, r)
        g.arcTo(x, y, x + w, y, r)
        g.closePath()
      }

      /** A canvas-texture label sprite, as the prototype draws them. */
      function labelSprite(text: string, sub: string, widthM: number, dot: string) {
        const c = document.createElement('canvas')
        c.width = 512
        c.height = 96
        const g = c.getContext('2d')
        if (g) {
          g.fillStyle = 'rgba(255,255,255,0.96)'
          roundRect(g, 6, 6, 500, 84, 18)
          g.fill()
          g.fillStyle = dot
          g.beginPath()
          g.arc(40, 48, 10, 0, Math.PI * 2)
          g.fill()
          g.fillStyle = '#1b1f24'
          g.font = '600 30px Inter, system-ui, sans-serif'
          g.textBaseline = 'middle'
          g.fillText(text, 64, 48)
          if (sub) {
            g.fillStyle = '#6b7480'
            g.font = '500 24px Inter, system-ui, sans-serif'
            g.fillText(sub, 64 + g.measureText(text).width * 1.25 + 14, 48)
          }
        }
        const tex = new THREE.CanvasTexture(c)
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }))
        sp.scale.set(widthM, (widthM * 96) / 512, 1)
        sp.renderOrder = 5
        return sp
      }

      /** Builds one element. `surface` rather than `top` — see pre-flight note 10. */
      function buildRow(r: VenueRow, originX: number, originZ: number) {
        const px = r.pos_x ?? 0
        const py = r.pos_y ?? 0
        const wpx = r.width ?? 72
        const hpx = r.height ?? 72
        const x = (px + wpx / 2) * PX_TO_M - originX
        const z = (py + hpx / 2) * PX_TO_M - originZ
        const w = wpx * PX_TO_M
        const d = hpx * PX_TO_M

        const g = new THREE.Group()
        g.position.set(x, 0, z)
        g.rotation.y = -((r.rotation ?? 0) * Math.PI) / 180

        const kind = (r.element_type ?? 'table').toLowerCase()
        const seats = Math.max(0, r.seats ?? 0)
        let labelY = 3
        let guests: TGroup | null = null

        if (kind === 'table') {
          const tw = w * 0.42
          const td = d * 0.42
          const surface = (r.shape ?? '').toLowerCase() === 'round'
            ? cylAt(tw / 2, tw / 2, 0.18, mat(C.timber))
            : boxAt(tw, 0.18, td, mat(C.timber))
          surface.position.y = 0.95
          g.add(surface)
          const leg = cylAt(0.18, 0.18, 0.9, mat(C.timberDark))
          leg.position.y = 0.45
          g.add(leg)

          const rad = Math.max(tw, td) / 2 + 0.5
          for (let i = 0; i < seats; i++) {
            const a = (i / seats) * Math.PI * 2
            g.add(boxAt(0.6, 0.5, 0.6, mat(C.timberDark), Math.cos(a) * rad, 0.55, Math.sin(a) * rad))
            const back = boxAt(0.6, 0.8, 0.1, mat(C.timberDark), Math.cos(a) * (rad + 0.25), 1.1, Math.sin(a) * (rad + 0.25))
            back.lookAt(0, 1.1, 0)
            g.add(back)
          }

          // Guests: min(seats, 4) capsules, shown only while occupied.
          guests = new THREE.Group()
          const n = Math.min(seats, 4)
          for (let i = 0; i < n; i++) {
            const a = (i / Math.max(n, 1)) * Math.PI * 2
            const body = cylAt(0.28, 0.28, 0.9, mat(GUEST_COLOURS[i % GUEST_COLOURS.length]))
            body.position.set(Math.cos(a) * rad, 1.05, Math.sin(a) * rad)
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), mat(0xf1c7a8))
            head.position.set(Math.cos(a) * rad, 1.75, Math.sin(a) * rad)
            guests.add(body, head)
          }
          guests.visible = isBusy(r.status)
          g.add(guests)
          labelY = 2.6
        } else if (kind === 'bar' || kind === 'counter') {
          g.add(boxAt(w, 1.1, d, mat(C.timber), 0, 0.55, 0))
          g.add(boxAt(w + 0.3, 0.15, d + 0.3, mat(C.timberDark), 0, 1.15, 0))
          if (kind === 'counter') {
            g.add(boxAt(1.2, 0.9, 1, mat(C.steel), 0, 1.65, -d / 2 + 2))
            g.add(boxAt(1.1, 0.7, 0.1, mat(C.dark), 0, 1.75, -d / 2 + 1.5))
          } else {
            for (let i = -w / 2 + 1; i < w / 2; i += 1.6) {
              const stool = cylAt(0.12, 0.12, 2.2, mat(C.steel))
              stool.position.set(i, 2.2, 0)
              g.add(stool)
            }
          }
        } else if (kind === 'kitchen') {
          g.add(boxAt(w, 0.1, d, mat(C.pad), 0, 0.25, 0, false))
          g.add(boxAt(Math.max(w - 1, 0.5), 1, 1.2, mat(C.steel), 0, 0.5, -d / 2 + 0.8))
          g.add(boxAt(Math.max(w - 1, 0.5), 0.1, 1.4, mat(C.bench), 0, 1.05, -d / 2 + 0.8))
          g.add(boxAt(Math.max(w - 1, 0.5), 0.9, 0.6, mat(C.steel), 0, 0.45, d / 2 - 0.6))
          g.add(boxAt(Math.max(w - 1, 0.5), 0.1, 0.8, mat(C.bench), 0, 0.95, d / 2 - 0.6))
        } else if (kind === 'entrance') {
          g.add(boxAt(w, 0.05, d, mat(0xb9a68d), 0, 0.25, 0, false))
          g.add(boxAt(0.3, 2.6, 0.3, mat(C.timberDark), -w / 2, 1.3, -d / 2))
          g.add(boxAt(0.3, 2.6, 0.3, mat(C.timberDark), w / 2, 1.3, -d / 2))
          g.add(boxAt(w, 0.3, 0.3, mat(C.timberDark), 0, 2.6, -d / 2))
          labelY = 3.4
        } else if (kind === 'wall') {
          g.add(boxAt(w, 3, d, mat(C.wall), 0, 1.5, 0))
          labelY = 3.6
        } else if (kind === 'plant') {
          g.add(cylAt(0.12, 0.16, 0.9, mat(C.trunk)).translateY(0.45))
          const canopy = new THREE.Mesh(new THREE.SphereGeometry(Math.max(w, d) * 0.5 || 0.6, 12, 10), mat(C.tree))
          canopy.position.y = 1.5
          canopy.castShadow = true
          g.add(canopy)
          labelY = 2.6
        } else {
          // Unknown element_type: a plain pad rather than nothing, so a new CHECK value still renders.
          g.add(boxAt(w, 0.3, d, mat(C.glass), 0, 0.15, 0))
        }

        const sub = needsYou(r) ? 'no order rung' : ''
        const sprite = labelSprite(rowLabel(r), sub, Math.max(4, Math.min(w * 1.6, 8)), dotColour(r))
        sprite.position.set(0, labelY, 0)
        g.add(sprite)

        return { group: g, guests, sprite, x, z, radius: Math.max(w, d) / 2 + 0.6 }
      }

      function Scene({ rows, onPick, onHover, selectedId, topDownNonce, reducedMotion }: SceneProps) {
        const { scene, camera, gl } = useThree()
        const controlsRef = useRef<{ target: TVector3; update: () => void } | null>(null)
        const pickRef = useRef<TObject3D[]>([])
        const entRef = useRef<Map<TObject3D, VenueRow>>(new Map())
        /** Camera distance for the current room — Top-down reuses it so the room still fills the frame. */
        const distRef = useRef(40)
        /** The selection ring, and where each row sits, so the ring can be moved without a rebuild. */
        const ringRef = useRef<TObject3D | null>(null)
        const spotRef = useRef<Map<string, { x: number; z: number; r: number }>>(new Map())
        /** The camera is framed ONCE. See the note on homedRef below. */
        const homedRef = useRef(false)

        /**
         * ⚠️ THE REBUILD KEY, and it is not `rows`.
         *
         * The poll hands down a brand-new array every 20 seconds, so an effect keyed on `rows` would
         * tear down and rebuild every mesh in the room three times a minute — visible flicker, and
         * hundreds of geometries churned for a payload that usually has not changed at all.
         *
         * This signature covers exactly the fields the scene draws, plus the NEEDS-YOU verdict so
         * that a table crossing the 20-minute line still re-colours its dot. Identical payload ⇒
         * identical key ⇒ no rebuild.
         */
        const sig = rows.map(r => [
          r.id, r.pos_x, r.pos_y, r.width, r.height, r.rotation, r.element_type, r.shape, r.seats,
          r.status, r.current_sale_id ?? '', needsYou(r) ? 1 : 0,
        ].join(':')).join('|')

        const rowsRef = useRef(rows)
        rowsRef.current = rows

        // ── build the world when the layout or any drawn state changes; dispose it on the way out ──
        useEffect(() => {
          const rows = rowsRef.current
          const world = new THREE.Group()
          const picks: TObject3D[] = []
          const ents = new Map<TObject3D, VenueRow>()

          // Bounding box of the layout, in metres, with a 2 m margin.
          const xs = rows.map(r => (r.pos_x ?? 0) * PX_TO_M)
          const zs = rows.map(r => (r.pos_y ?? 0) * PX_TO_M)
          const xe = rows.map(r => ((r.pos_x ?? 0) + (r.width ?? 72)) * PX_TO_M)
          const ze = rows.map(r => ((r.pos_y ?? 0) + (r.height ?? 72)) * PX_TO_M)
          const minX = xs.length ? Math.min(...xs) : 0
          const minZ = zs.length ? Math.min(...zs) : 0
          const maxX = xe.length ? Math.max(...xe) : 8
          const maxZ = ze.length ? Math.max(...ze) : 8
          const floorW = maxX - minX + 4
          const floorD = maxZ - minZ + 4
          const originX = minX + (maxX - minX) / 2
          const originZ = minZ + (maxZ - minZ) / 2

          const floor = new THREE.Mesh(
            new THREE.BoxGeometry(floorW, 0.2, floorD),
            mat(C.floor),
          )
          floor.position.y = -0.1
          floor.receiveShadow = true
          world.add(floor)

          const spots = new Map<string, { x: number; z: number; r: number }>()
          for (const r of rows) {
            const built = buildRow(r, originX, originZ)
            built.group.traverse(o => {
              ents.set(o, r)
              if ((o as TMesh).isMesh) picks.push(o)
            })
            world.add(built.group)
            spots.set(r.id, { x: built.x, z: built.z, r: built.radius })
          }

          // The selection ring: one mesh, moved on selection rather than rebuilt. Hidden until a
          // row is picked.
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.86, 1, 48),
            new THREE.MeshBasicMaterial({ color: 0x2d5240, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
          )
          ring.rotation.x = -Math.PI / 2
          ring.position.y = 0.03
          ring.visible = false
          world.add(ring)
          ringRef.current = ring

          scene.add(world)
          pickRef.current = picks
          entRef.current = ents
          spotRef.current = spots

          // Camera home: polar .78, azimuth .35, 0.9 × floor diagonal.
          const diag = Math.hypot(floorW, floorD)
          const dist = 0.9 * diag
          distRef.current = dist

          // ⚠️ ONCE. Re-framing on every rebuild would throw the owner back to the default angle
          // whenever a table changed state — losing the view they had just orbited to, while they
          // were looking at it. Top-down is the only thing that may move the camera afterwards.
          if (!homedRef.current) {
            homedRef.current = true
            const ph = 0.78
            const th = 0.35
            camera.position.set(
              dist * Math.sin(ph) * Math.sin(th),
              dist * Math.cos(ph),
              dist * Math.sin(ph) * Math.cos(th),
            )
            camera.lookAt(0, 0, 0)
          }

          return () => {
            scene.remove(world)
            world.traverse(o => {
              const m = o as TMesh
              if (m.geometry) m.geometry.dispose()
              const mm = (m as unknown as { material?: TMaterial | TMaterial[] }).material
              if (Array.isArray(mm)) mm.forEach(x => x?.dispose())
              else mm?.dispose()
              const sp = o as unknown as { material?: { map?: TTexture } }
              sp.material?.map?.dispose?.()
            })
            pickRef.current = []
            entRef.current = new Map()
            spotRef.current = new Map()
            ringRef.current = null
          }
        }, [sig, scene, camera])

        // ── manual raycast: the meshes are imperative, so R3F's event system cannot see them ──
        useEffect(() => {
          const el = gl.domElement
          const ray = new THREE.Raycaster()
          const v = new THREE.Vector2()
          let downAt: { x: number; y: number } | null = null

          const toNdc = (e: PointerEvent) => {
            const b = el.getBoundingClientRect()
            v.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1)
          }
          const findRow = (e: PointerEvent): VenueRow | null => {
            toNdc(e)
            ray.setFromCamera(v, camera)
            const hit = ray.intersectObjects(pickRef.current, false)[0]
            return hit ? entRef.current.get(hit.object) ?? null : null
          }

          const onDown = (e: PointerEvent) => { downAt = { x: e.clientX, y: e.clientY } }
          const onUp = (e: PointerEvent) => {
            const moved = downAt ? Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) : 99
            downAt = null
            if (moved >= 3) return   // a drag, not a click
            onPick(findRow(e))
          }
          const onMove = (e: PointerEvent) => {
            const row = findRow(e)
            el.style.cursor = row ? 'pointer' : 'grab'
            onHover(row ? { x: e.clientX, y: e.clientY, row } : null)
          }
          const onLeave = () => onHover(null)

          el.addEventListener('pointerdown', onDown)
          el.addEventListener('pointerup', onUp)
          el.addEventListener('pointermove', onMove)
          el.addEventListener('pointerleave', onLeave)
          return () => {
            el.removeEventListener('pointerdown', onDown)
            el.removeEventListener('pointerup', onUp)
            el.removeEventListener('pointermove', onMove)
            el.removeEventListener('pointerleave', onLeave)
          }
        }, [gl, camera, onPick, onHover])

        // ── the selection ring follows the picked row ──
        useEffect(() => {
          const ring = ringRef.current
          if (!ring) return
          const spot = selectedId ? spotRef.current.get(selectedId) : undefined
          if (!spot) { ring.visible = false; return }
          ring.position.set(spot.x, 0.03, spot.z)
          ring.scale.setScalar(Math.max(spot.r, 0.8))
          ring.visible = true
        }, [selectedId, sig])

        // ── Top-down: polar 0.16, the shallowest the clamp allows, keeping the current distance ──
        useEffect(() => {
          if (topDownNonce === 0) return
          const dist = distRef.current
          const ph = 0.16
          const th = 0
          camera.position.set(
            dist * Math.sin(ph) * Math.sin(th),
            dist * Math.cos(ph),
            dist * Math.sin(ph) * Math.cos(th),
          )
          camera.lookAt(0, 0, 0)
          controlsRef.current?.update()
        }, [topDownNonce, camera])

        return (
          <>
            <hemisphereLight args={[0xffffff, 0xb8c2cc, 0.75]} />
            <directionalLight
              position={[-40, 80, 40]}
              intensity={0.95}
              color={0xfff4e0}
              castShadow
              shadow-mapSize-width={2048}
              shadow-mapSize-height={2048}
              /* ⚠️ The default shadow camera is a ±5-unit box. At PX_TO_M = 0.08 an 800px layout is
                 64 m across, so every shadow would fall outside the frustum and silently not render
                 — present, configured, doing nothing. These bounds cover the largest plausible room. */
              shadow-camera-left={-90}
              shadow-camera-right={90}
              shadow-camera-top={90}
              shadow-camera-bottom={-90}
              shadow-camera-far={400}
            />
            <OrbitControls
              ref={controlsRef as never}
              enablePan={false}
              enableDamping={!reducedMotion}
              autoRotate={false}
              minPolarAngle={0.15}
              maxPolarAngle={1.4}
              target={[0, 0, 0]}
            />
          </>
        )
      }

      function VenueCanvas(props: SceneProps) {
        return (
          // ⚠️ Explicit 100% — without it the canvas renders at the 300×150 default (pre-flight 10).
          <Canvas
            style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
            dpr={[1, 2]}
            shadows
            camera={{ fov: 38, near: 0.5, far: 900 }}
            onCreated={({ scene }) => {
              scene.background = new THREE.Color(0xeef0f2)
              scene.fog = new THREE.Fog(0xeef0f2, 120, 300)
            }}
          >
            <Scene {...props} />
          </Canvas>
        )
      }

      return { default: VenueCanvas }
    }),
  { ssr: false, loading: () => null },
)

/* ── public component ───────────────────────────────────────────────────────────────────────── */

export function VenueView3D({ businessId, onSelect }: { businessId: string; onSelect?: (row: VenueRow) => void }) {
  const [rows, setRows] = useState<VenueRow[] | null>(null)
  const [summary, setSummary] = useState<VenueSummary | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hover, setHover] = useState<HoverState | null>(null)
  const [topDownNonce, setTopDownNonce] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)
  const shellRef = useRef<HTMLDivElement | null>(null)

  // ⚠️ No business_id in the query: the route resolves the active business from the session, and
  // honouring a caller-supplied id would be the cross-business leak RULE 7 exists for. See note 8.
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/pos/tables?venue=1', { cache: 'no-store' })
      if (!res.ok) { setErr('Could not load the layout (' + res.status + ')'); return }
      const d = await res.json() as { tables?: VenueRow[]; summary?: VenueSummary; error?: string }
      if (d.error) { setErr(d.error); return }
      setErr(null)
      setRows(d.tables ?? [])
      setSummary(d.summary ?? null)
    } catch (e) {
      setErr((e as Error).message)
    }
  }, [])

  // Poll every 20 s while mounted; stop on unmount.
  useEffect(() => {
    let alive = true
    const run = () => { if (alive) void load() }
    run()
    const id = window.setInterval(run, 20_000)
    return () => { alive = false; window.clearInterval(id) }
  }, [load, businessId])

  // Esc closes the card.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedId(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // prefers-reduced-motion, read live rather than once — the owner can change it while the tab is open.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReducedMotion(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const onPick = useCallback((r: VenueRow | null) => setSelectedId(r?.id ?? null), [])
  const onHover = useCallback((h: HoverState | null) => setHover(h), [])

  const selected = useMemo(
    () => (rows ?? []).find(r => r.id === selectedId) ?? null,
    [rows, selectedId],
  )

  const shell: React.CSSProperties = {
    position: 'relative', width: '100%', height: '100%', minHeight: 420,
    borderRadius: 16, overflow: 'hidden', background: '#eef0f2', fontFamily: T.font,
  }

  if (rows === null && !err) {
    return <div style={{ ...shell, display: 'grid', placeItems: 'center', color: '#6b7480', fontSize: 13 }}>Loading the room…</div>
  }
  if (err) {
    return <div style={{ ...shell, display: 'grid', placeItems: 'center', color: '#6b7480', fontSize: 13, padding: 16, textAlign: 'center' }}>{err}</div>
  }
  if ((rows ?? []).length === 0) {
    return (
      <div style={{ ...shell, display: 'grid', placeItems: 'center', color: '#6b7480', fontSize: 13, padding: 16, textAlign: 'center' }}>
        No layout yet — add tables in Edit layout
      </div>
    )
  }

  const needing = (rows ?? []).filter(r => needsYou(r)).length

  return (
    <div ref={shellRef} style={shell}>
      <VenueScene
        rows={rows ?? []}
        onPick={onPick}
        onHover={onHover}
        selectedId={selectedId}
        topDownNonce={topDownNonce}
        reducedMotion={reducedMotion}
      />

      {/* Camera control. Drag to orbit is the scene's own; this is the one preset worth a button. */}
      <div style={{ position: 'absolute', left: 14, top: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={() => setTopDownNonce(n => n + 1)}
          style={{
            border: '1px solid rgba(0,0,0,0.08)', borderRadius: 9, cursor: 'pointer',
            background: 'rgba(255,255,255,0.94)', color: '#1b1f24',
            padding: '7px 12px', fontSize: 12, fontWeight: 600, fontFamily: T.font,
            boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
          }}
        >Top-down</button>
        {needing > 0 && (
          <span style={{
            borderRadius: 9, padding: '7px 11px', fontSize: 12, fontWeight: 700,
            background: 'rgba(224,58,47,0.95)', color: '#fff',
            boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
          }}>{needing} need{needing === 1 ? 's' : ''} you</span>
        )}
      </div>

      {/* Hover tooltip. Positioned against the shell, so it stays inside the 16:10 box. */}
      {hover && hover.row.id !== selectedId && (() => {
        const box = shellRef.current?.getBoundingClientRect()
        const zone = rowZone(hover.row)
        return (
          <div style={{
            position: 'absolute',
            left: Math.max(8, Math.min((box ? hover.x - box.left : hover.x) + 14, (box?.width ?? 400) - 8)),
            top: Math.max(8, (box ? hover.y - box.top : hover.y) + 14),
            pointerEvents: 'none', borderRadius: 8, padding: '6px 9px',
            background: 'rgba(27,31,36,0.92)', color: '#fff', fontSize: 11, fontWeight: 600,
            fontFamily: T.font, whiteSpace: 'nowrap', maxWidth: 'calc(100% - 16px)', overflow: 'hidden',
          }}>
            {rowLabel(hover.row)}{zone ? ' · ' + zone : ''}
          </div>
        )
      })()}

      {selected && (
        <div style={{
          position: 'absolute', right: 16, top: 16, bottom: 16,
          width: 'min(300px, calc(100% - 32px))', display: 'flex', alignItems: 'flex-start',
          pointerEvents: 'none',
        }}>
          <div style={{ pointerEvents: 'auto', width: '100%', maxHeight: '100%' }}>
            <VenueCard row={selected} summary={summary} needingCount={needing} onSelect={onSelect} onClose={() => setSelectedId(null)} />
          </div>
        </div>
      )}
    </div>
  )
}

export default VenueView3D
