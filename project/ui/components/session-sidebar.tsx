"use client"

import { MoreHorizontal, Plus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarSeparator,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import type { AuthUser } from "@/utils/auth"
import { cn } from "@/utils/utils"

export type SessionSidebarItem = {
  sessionId: string
  title: string
  timeLabel: string
  unreadCount: number
  isActive: boolean
  isEditing: boolean
  editingTitle: string
}

type SessionSidebarProps = {
  user: AuthUser
  sessions: SessionSidebarItem[]
  openSessionMenuId: string | null
  onCreateSession: () => void
  onSelectSession: (sessionId: string) => void
  onBeginRenameSession: (sessionId: string) => void
  onCommitRenameSession: (sessionId: string) => void
  onCancelRenameSession: () => void
  onDeleteSession: (sessionId: string) => void
  onEditingTitleChange: (value: string) => void
  onOpenSessionMenuChange: (sessionId: string | null) => void
  onLogout: () => void
  logoutPending?: boolean
}

export function SessionSidebar({
  user,
  sessions,
  openSessionMenuId,
  onCreateSession,
  onSelectSession,
  onBeginRenameSession,
  onCommitRenameSession,
  onCancelRenameSession,
  onDeleteSession,
  onEditingTitleChange,
  onOpenSessionMenuChange,
  onLogout,
  logoutPending = false,
}: SessionSidebarProps) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center justify-between gap-2 rounded-lg bg-sidebar-accent/25 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-sidebar-foreground">Sessions</p>
          </div>
          <Button
            type="button"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90"
            onClick={onCreateSession}
            aria-label="Create session"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </SidebarHeader>
      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Recent</SidebarGroupLabel>
          <SidebarMenu>
            {sessions.length === 0 ? (
              <SidebarMenuItem>
                <div className="rounded-md border border-dashed border-sidebar-border px-3 py-4 text-sm text-sidebar-foreground/60">
                  No sessions yet.
                </div>
              </SidebarMenuItem>
            ) : (
              sessions.map((session) => {
                const menuOpen = openSessionMenuId === session.sessionId
                return (
                  <SidebarMenuItem key={session.sessionId} className="group/session relative">
                    {session.isEditing ? (
                      <div className="flex items-center gap-2 rounded-md border border-sidebar-border bg-background px-2 py-1.5">
                        <input
                          autoFocus
                          value={session.editingTitle}
                          onChange={(event) => onEditingTitleChange(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault()
                              onCommitRenameSession(session.sessionId)
                              return
                            }
                            if (event.key === "Escape") {
                              event.preventDefault()
                              onCancelRenameSession()
                            }
                          }}
                          onBlur={() => {
                            onCommitRenameSession(session.sessionId)
                          }}
                          className="h-7 min-w-0 flex-1 border-0 bg-transparent px-1 text-sm outline-none ring-0 placeholder:text-muted-foreground focus-visible:ring-0"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-sidebar-foreground"
                          onClick={() => onCommitRenameSession(session.sessionId)}
                        >
                          Save
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-sidebar-foreground"
                          onClick={onCancelRenameSession}
                          aria-label="Cancel rename"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <SidebarMenuButton
                        asChild
                        isActive={session.isActive}
                        tooltip={session.title}
                        className={cn(
                          "justify-between gap-3 pr-10",
                          session.isActive && "bg-sidebar-accent/70 text-sidebar-accent-foreground shadow-sm",
                        )}
                      >
                        <button type="button" onClick={() => onSelectSession(session.sessionId)}>
                          <span className="min-w-0 flex-1 truncate">{session.title}</span>
                          <span className="shrink-0 text-[11px] text-sidebar-foreground/60">
                            {session.timeLabel}
                          </span>
                        </button>
                      </SidebarMenuButton>
                    )}

                    {!session.isEditing ? (
                      <>
                        {session.unreadCount > 0 ? (
                          <span className="pointer-events-none absolute right-8 top-2 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                            {session.unreadCount}
                          </span>
                        ) : null}
                        <DropdownMenu
                          open={menuOpen}
                          onOpenChange={(open) => onOpenSessionMenuChange(open ? session.sessionId : null)}
                        >
                          <DropdownMenuTrigger asChild>
                            <SidebarMenuAction showOnHover>
                              <MoreHorizontal />
                              <span className="sr-only">Session actions</span>
                            </SidebarMenuAction>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="w-40 rounded-lg" align="end">
                            <DropdownMenuItem
                              onSelect={() => {
                                onBeginRenameSession(session.sessionId)
                                onOpenSessionMenuChange(null)
                              }}
                            >
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600 focus:text-red-600"
                              onSelect={() => {
                                onDeleteSession(session.sessionId)
                                onOpenSessionMenuChange(null)
                              }}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    ) : null}
                  </SidebarMenuItem>
                )
              })
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarSeparator />

      <SidebarFooter>
        <div className="rounded-lg bg-sidebar-accent/25 px-3 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-sidebar-foreground">{user.name}</p>
            <p className="truncate text-xs text-sidebar-foreground/60">{user.email}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "mt-3 h-8 w-full justify-start px-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
            onClick={onLogout}
            disabled={logoutPending}
          >
            Log out
          </Button>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
