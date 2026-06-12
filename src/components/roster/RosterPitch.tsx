"use client"

import { useEffect, useState } from "react"
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core"
import { useSortable, SortableContext, rectSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { RosterConfig } from "@/types/draft"

interface PlayerSlot {
  slotId: string
  playerId: number
  playerName: string
  position: string
  clubShort: string
  totalPoints: number
  gwPoints: number | null
  isStarting: boolean
  locked?: boolean
}

interface RosterPitchProps {
  teamId: string
  slots: PlayerSlot[]
  rosterConfig: RosterConfig
  /** Player ids locked because their club has kicked off (live gameweek). */
  lockedPlayerIds?: number[]
  /** True when the gameweek is in-flight, enabling live-sub locking + polling. */
  live?: boolean
}

const POS_COLORS: Record<string, string> = {
  GK: "bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-300",
  DEF: "bg-sky-500/15 border-sky-500/30 text-sky-600 dark:text-sky-300",
  MID: "bg-violet-500/15 border-violet-500/30 text-violet-600 dark:text-violet-300",
  FWD: "bg-rose-500/15 border-rose-500/30 text-rose-600 dark:text-rose-300",
}

function PlayerCard({
  slot,
  isDragging = false,
  isSelected = false,
  onClick,
}: {
  slot: PlayerSlot
  isDragging?: boolean
  isSelected?: boolean
  onClick?: () => void
}) {
  return (
    <div
      onClick={slot.locked ? undefined : onClick}
      title={slot.locked ? "Locked — this player's match has kicked off" : undefined}
      className={cn(
        "relative flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg border text-center select-none transition-all",
        "min-w-[80px] max-w-[96px]",
        slot.locked ? "cursor-not-allowed opacity-60 grayscale" : "cursor-grab hover:brightness-110",
        isDragging ? "opacity-50" : "",
        isSelected ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : "",
        POS_COLORS[slot.position] ?? "bg-muted/50 border-border text-foreground"
      )}>
      {slot.locked && (
        <span className="absolute top-0.5 right-1 text-[10px] leading-none" aria-label="locked">🔒</span>
      )}
      <span className="text-[10px] font-bold uppercase opacity-70">{slot.position}</span>
      <span className="text-xs font-semibold text-foreground leading-tight truncate w-full">{slot.playerName}</span>
      <span className="text-[10px] opacity-60">{slot.clubShort}</span>
      {slot.gwPoints !== null ? (
        <span className="text-xs font-bold text-foreground">{slot.gwPoints}pts</span>
      ) : (
        <span className="text-[10px] opacity-50">{slot.totalPoints}tot</span>
      )}
    </div>
  )
}

function SortablePlayerCard({ slot, isSelected, onClick }: { slot: PlayerSlot; isSelected: boolean; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slot.playerId,
    disabled: slot.locked,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  return (
    <div ref={setNodeRef} style={style} {...(slot.locked ? {} : { ...attributes, ...listeners })}>
      <PlayerCard slot={slot} isDragging={isDragging} isSelected={isSelected} onClick={onClick} />
    </div>
  )
}

function PitchRow({ label, slots, allIds, selected, onSelect }: {
  label: string
  slots: PlayerSlot[]
  allIds: number[]
  selected: number | null
  onSelect: (id: number) => void
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">{label}</span>
      <SortableContext items={allIds} strategy={rectSortingStrategy}>
        <div className="flex gap-2 justify-center flex-wrap">
          {slots.map(slot => (
            <SortablePlayerCard
              key={slot.playerId}
              slot={slot}
              isSelected={selected === slot.playerId}
              onClick={() => onSelect(slot.playerId)}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}

export function RosterPitch({
  teamId,
  slots: initialSlots,
  lockedPlayerIds = [],
  live = false,
}: RosterPitchProps) {
  const [lockedSet, setLockedSet] = useState<Set<number>>(() => new Set(lockedPlayerIds))
  const [slots, setSlots] = useState(() =>
    initialSlots.map(s => ({ ...s, locked: lockedSet.has(s.playerId) }))
  )
  const [activeId, setActiveId] = useState<number | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  // While the gameweek is live, poll the lineup endpoint so locks refresh as more
  // fixtures kick off. Only the locked set is updated — the manager's unsaved
  // lineup edits are preserved.
  useEffect(() => {
    if (!live) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/roster/${teamId}/lineup`)
        if (!res.ok) return
        const data = await res.json()
        const nextLocked = new Set<number>(data.lockedPlayerIds ?? [])
        setLockedSet(nextLocked)
        setSlots(prev => prev.map(s => ({ ...s, locked: nextLocked.has(s.playerId) })))
      } catch {
        /* transient — next tick retries */
      }
    }, 30_000)
    return () => clearInterval(interval)
  }, [live, teamId])

  const starters = slots.filter(s => s.isStarting)
  const bench = slots.filter(s => !s.isStarting)

  const gkSlots = starters.filter(s => s.position === "GK")
  const defSlots = starters.filter(s => s.position === "DEF")
  const midSlots = starters.filter(s => s.position === "MID")
  const fwdSlots = starters.filter(s => s.position === "FWD")

  const allIds = slots.map(s => s.playerId)

  // Click-to-swap: first click selects, second click on different player swaps
  function handleSelect(playerId: number) {
    if (selected === null) {
      setSelected(playerId)
      return
    }
    if (selected === playerId) {
      setSelected(null)
      return
    }
    // Swap isStarting between selected and clicked
    swapPlayers(selected, playerId)
    setSelected(null)
  }

  function swapPlayers(aId: number, bId: number) {
    if (lockedSet.has(aId) || lockedSet.has(bId)) {
      toast.error("That player's match has kicked off — they're locked for this gameweek")
      return
    }
    setSlots(prev => {
      const next = [...prev]
      const ai = next.findIndex(s => s.playerId === aId)
      const bi = next.findIndex(s => s.playerId === bId)
      if (ai === -1 || bi === -1) return prev
      const aStarting = next[ai].isStarting
      next[ai] = { ...next[ai], isStarting: next[bi].isStarting }
      next[bi] = { ...next[bi], isStarting: aStarting }
      return next
    })
    setDirty(true)
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as number)
    setSelected(null)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    if (!over || active.id === over.id) return
    swapPlayers(active.id as number, over.id as number)
  }

  async function saveLineup() {
    setSaving(true)
    const starterIds = slots.filter(s => s.isStarting).map(s => s.playerId)
    const res = await fetch(`/api/roster/${teamId}/lineup`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ starters: starterIds }),
    })
    setSaving(false)
    if (res.ok) {
      toast.success("Lineup saved!")
      setDirty(false)
    } else {
      const { error } = await res.json()
      toast.error(typeof error === "string" ? error : "Failed to save lineup")
    }
  }

  const activeSlot = activeId ? slots.find(s => s.playerId === activeId) : null

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="space-y-4">
        {/* Save bar */}
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            {live && (
              <span className="mr-2 inline-flex items-center gap-1 rounded bg-danger/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-danger">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" /> Live · 🔒 = locked
              </span>
            )}
            {selected !== null
              ? <span className="text-primary">✓ Player selected — click another to swap</span>
              : "Drag players or click to select & swap"}
          </p>
          <button
            onClick={saveLineup}
            disabled={!dirty || saving}
            className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-primary-foreground text-sm font-semibold transition-colors">
            {saving ? "Saving…" : dirty ? "Save lineup" : "Saved ✓"}
          </button>
        </div>

        {/* Pitch */}
        <div className="relative rounded-2xl overflow-hidden border border-border">
          {/* Grass background */}
          <div className="absolute inset-0 bg-gradient-to-b from-emerald-600/20 to-emerald-700/10 dark:from-emerald-800/30 dark:to-emerald-950/20" />
          <div className="absolute inset-0" style={{
            backgroundImage: "repeating-linear-gradient(180deg, transparent, transparent 48px, color-mix(in oklch, var(--foreground) 4%, transparent) 48px, color-mix(in oklch, var(--foreground) 4%, transparent) 49px)",
          }} />

          <div className="relative z-10 py-6 px-4 space-y-6">
            <PitchRow label="Goalkeeper" slots={gkSlots} allIds={allIds} selected={selected} onSelect={handleSelect} />
            <PitchRow label={`Defenders (${defSlots.length})`} slots={defSlots} allIds={allIds} selected={selected} onSelect={handleSelect} />
            <PitchRow label={`Midfielders (${midSlots.length})`} slots={midSlots} allIds={allIds} selected={selected} onSelect={handleSelect} />
            <PitchRow label={`Forwards (${fwdSlots.length})`} slots={fwdSlots} allIds={allIds} selected={selected} onSelect={handleSelect} />

            {/* Bench divider */}
            <div className="relative flex items-center gap-3 py-1">
              <div className="flex-1 border-t border-border border-dashed" />
              <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Bench</span>
              <div className="flex-1 border-t border-border border-dashed" />
            </div>

            <div className="flex gap-2 justify-center flex-wrap">
              {bench.map(slot => (
                <SortablePlayerCard
                  key={slot.playerId}
                  slot={slot}
                  isSelected={selected === slot.playerId}
                  onClick={() => handleSelect(slot.playerId)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-3 text-[10px] text-muted-foreground justify-center flex-wrap">
          {["GK", "DEF", "MID", "FWD"].map(pos => (
            <span key={pos} className={cn("px-2 py-0.5 rounded border", POS_COLORS[pos])}>{pos}</span>
          ))}
          <span className="ml-2">pts = this GW · tot = season total</span>
        </div>
      </div>

      <DragOverlay>
        {activeSlot && <PlayerCard slot={activeSlot} />}
      </DragOverlay>
    </DndContext>
  )
}
