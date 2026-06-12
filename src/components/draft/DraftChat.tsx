"use client"

import { useState, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import type { DraftChatMessage } from "@/types/draft"

interface DraftChatProps {
  messages: DraftChatMessage[]
  onSend: (content: string) => void
  myTeamName: string
}

export function DraftChat({ messages, onSend }: DraftChatProps) {
  const [input, setInput] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  function send() {
    if (!input.trim()) return
    onSend(input)
    setInput("")
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto space-y-1 min-h-0 pb-1">
        {messages.length === 0 && (
          <p className="text-muted-foreground text-[10px] text-center py-2">No messages yet</p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className="text-xs px-1">
            <span className="text-primary font-medium">
              {(msg as unknown as { teamName?: string }).teamName ?? msg.userName}
            </span>
            <span className="text-muted-foreground">: </span>
            <span className="text-foreground">{msg.content}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-1 mt-1.5">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder="Message…"
          className="bg-muted border-border text-foreground placeholder:text-muted-foreground text-xs h-7 flex-1"
        />
        <button
          onClick={send}
          className="px-2 h-7 rounded bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium transition-colors">
          →
        </button>
      </div>
    </div>
  )
}
