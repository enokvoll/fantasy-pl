"use client"

import type { QueueItem } from "@/types/draft"

interface DraftQueueProps {
  queue: QueueItem[]
  onRemove: (playerId: number) => void
  onReorder: (playerIds: number[]) => void
}

export function DraftQueue({ queue, onRemove, onReorder }: DraftQueueProps) {
  function moveUp(index: number) {
    if (index === 0) return
    const ids = queue.map(q => q.playerId)
    ;[ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]
    onReorder(ids)
  }

  function moveDown(index: number) {
    if (index === queue.length - 1) return
    const ids = queue.map(q => q.playerId)
    ;[ids[index], ids[index + 1]] = [ids[index + 1], ids[index]]
    onReorder(ids)
  }

  if (queue.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-slate-500 text-xs">Queue empty</p>
        <p className="text-slate-600 text-[10px] mt-1">Press Q+ next to a player to add them</p>
      </div>
    )
  }

  return (
    <div className="space-y-1 overflow-y-auto max-h-[160px]">
      {queue.map((item, i) => (
        <div key={item.playerId} className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800/50 group">
          <span className="text-slate-600 text-[10px] w-4 text-center font-mono">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <span className="text-slate-300 text-xs truncate block">{item.playerName}</span>
          </div>
          <span className="text-slate-500 text-[10px]">{item.position}</span>
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => moveUp(i)} className="text-slate-500 hover:text-slate-300 text-[10px] px-1">↑</button>
            <button onClick={() => moveDown(i)} className="text-slate-500 hover:text-slate-300 text-[10px] px-1">↓</button>
            <button onClick={() => onRemove(item.playerId)} className="text-red-500 hover:text-red-400 text-[10px] px-1">×</button>
          </div>
        </div>
      ))}
    </div>
  )
}
