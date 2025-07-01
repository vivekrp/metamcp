import { MetaMcpLogEntry } from "@repo/zod-types";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

import { vanillaTrpcClient } from "../trpc";

interface LogsState {
  logs: MetaMcpLogEntry[];
  isLoading: boolean;
  isAutoRefreshing: boolean;
  totalCount: number;
  lastFetch: Date | null;

  // Actions
  fetchLogs: () => Promise<void>;
  clearLogs: () => Promise<void>;
  startAutoRefresh: () => void;
  stopAutoRefresh: () => void;
  setAutoRefresh: (enabled: boolean) => void;
}

let refreshInterval: NodeJS.Timeout | null = null;
const REFRESH_INTERVAL = 2000; // 2 seconds

export const useLogsStore = create<LogsState>()(
  subscribeWithSelector((set, get) => ({
    logs: [],
    isLoading: false,
    isAutoRefreshing: true, // Start with auto-refresh enabled
    totalCount: 0,
    lastFetch: null,

    fetchLogs: async () => {
      try {
        set({ isLoading: true });

        const response = await vanillaTrpcClient.frontend.logs.get.query({
          limit: 500,
        });

        if (response.success) {
          set({
            logs:
              response.data?.map((log) => ({
                ...log,
                timestamp: new Date(log.timestamp),
              })) || [],
            totalCount: response.totalCount || 0,
            lastFetch: new Date(),
            isLoading: false,
          });
        }
      } catch (error) {
        console.error("Failed to fetch logs:", error);
        set({ isLoading: false });
      }
    },

    clearLogs: async () => {
      try {
        await vanillaTrpcClient.frontend.logs.clear.mutate();
        set({ logs: [], totalCount: 0 });
      } catch (error) {
        console.error("Failed to clear logs:", error);
      }
    },

    startAutoRefresh: () => {
      const state = get();
      if (refreshInterval) return; // Already running

      // Fetch immediately
      state.fetchLogs();

      // Set up interval
      refreshInterval = setInterval(() => {
        const currentState = get();
        if (currentState.isAutoRefreshing) {
          currentState.fetchLogs();
        }
      }, REFRESH_INTERVAL);

      set({ isAutoRefreshing: true });
    },

    stopAutoRefresh: () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
      }
      set({ isAutoRefreshing: false });
    },

    setAutoRefresh: (enabled: boolean) => {
      if (enabled) {
        get().startAutoRefresh();
      } else {
        get().stopAutoRefresh();
      }
    },
  })),
);

// Auto-start when store is created
if (typeof window !== "undefined") {
  // Only start in browser environment
  setTimeout(() => {
    useLogsStore.getState().startAutoRefresh();
  }, 100);
}

// Cleanup on page unload
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
  });
}
