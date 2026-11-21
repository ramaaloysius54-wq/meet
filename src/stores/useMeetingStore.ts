import { create } from "zustand";
import type {
  ChatMessage,
  LiveParticipantTile,
  Meeting,
  NotificationItem,
  Profile,
  ReactionBurst
} from "@/types";

const NOTIFICATION_TTL_MS = 5000;

interface MeetingStoreState {
  profile: Profile | null;
  setProfile: (profile: Profile | null) => void;

  currentMeeting: Meeting | null;
  setCurrentMeeting: (meeting: Meeting | null) => void;

  tiles: LiveParticipantTile[];
  setTiles: (tiles: LiveParticipantTile[]) => void;

  messages: ChatMessage[];
  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  unreadCount: number;
  resetUnread: () => void;

  rightTab: "participants" | "chat";
  setRightTab: (tab: "participants" | "chat") => void;

  mobileDrawerOpen: boolean;
  setMobileDrawerOpen: (open: boolean) => void;

  viewMode: "grid" | "speaker";
  setViewMode: (mode: "grid" | "speaker") => void;

  reactions: ReactionBurst[];
  pushReaction: (reaction: ReactionBurst) => void;

  notifications: NotificationItem[];
  pushNotification: (n: Omit<NotificationItem, "id" | "createdAt" | "read">) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  markAllNotificationsRead: () => void;

  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

export const useMeetingStore = create<MeetingStoreState>((set) => ({
  profile: null,
  setProfile: (profile) => set({ profile }),

  currentMeeting: null,
  setCurrentMeeting: (currentMeeting) => set({ currentMeeting }),

  tiles: [],
  setTiles: (tiles) => set({ tiles }),

  messages: [],
  setMessages: (messages) => set({ messages }),
  addMessage: (message) =>
    set((state) => {
      if (state.messages.some((m) => m.id === message.id)) return state;
      return {
        messages: [...state.messages, message],
        unreadCount: state.rightTab === "chat" ? 0 : state.unreadCount + 1
      };
    }),
  unreadCount: 0,
  resetUnread: () => set({ unreadCount: 0 }),

  rightTab: "participants",
  setRightTab: (rightTab) =>
    set((state) => ({
      rightTab,
      unreadCount: rightTab === "chat" ? 0 : state.unreadCount
    })),

  mobileDrawerOpen: false,
  setMobileDrawerOpen: (mobileDrawerOpen) => set({ mobileDrawerOpen }),

  viewMode: "grid",
  setViewMode: (viewMode) => set({ viewMode }),

  reactions: [],
  pushReaction: (reaction) => {
    set((state) => ({ reactions: [...state.reactions.slice(-10), reaction] }));
    setTimeout(() => {
      set((state) => ({
        reactions: state.reactions.filter((r) => r.id !== reaction.id)
      }));
    }, 3200);
  },

  notifications: [
    {
      id: "welcome-1",
      title: "RamaMeet Siap Digunakan",
      message: "Enkripsi WebRTC DTLS-SRTP aktif untuk semua rapat.",
      type: "success",
      createdAt: new Date().toISOString(),
      read: false
    }
  ],
  pushNotification: (n) => {
    const id = crypto.randomUUID();
    set((state) => ({
      notifications: [
        {
          ...n,
          id,
          createdAt: new Date().toISOString(),
          read: false
        },
        ...state.notifications.slice(0, 19)
      ]
    }));

    setTimeout(() => {
      set((state) => ({
        notifications: state.notifications.filter((item) => item.id !== id)
      }));
    }, NOTIFICATION_TTL_MS);
  },
  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((item) => item.id !== id)
    })),
  clearNotifications: () => set({ notifications: [] }),
  markAllNotificationsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true }))
    })),

  searchQuery: "",
  setSearchQuery: (searchQuery) => set({ searchQuery })
}));
