import { create } from "zustand";
import type { PublicUser } from "@shared/api";
import * as api from "../api";

interface AuthState {
  user: PublicUser | null;
  status: "idle" | "loading" | "ready";
  error: string | null;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "idle",
  error: null,

  bootstrap: async () => {
    const token = localStorage.getItem("mc_token");
    if (!token) {
      set({ status: "ready" });
      return;
    }
    try {
      const { user } = await api.me();
      set({ user, status: "ready" });
    } catch {
      localStorage.removeItem("mc_token");
      set({ user: null, status: "ready" });
    }
  },

  login: async (email, password) => {
    set({ error: null });
    try {
      const { user, token } = await api.login({ email, password });
      localStorage.setItem("mc_token", token);
      set({ user });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Login failed." });
      throw error;
    }
  },

  register: async (email, password, displayName) => {
    set({ error: null });
    try {
      const { user, token } = await api.register({ email, password, displayName });
      localStorage.setItem("mc_token", token);
      set({ user });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Registration failed." });
      throw error;
    }
  },

  logout: async () => {
    try {
      await api.logout();
    } finally {
      localStorage.removeItem("mc_token");
      set({ user: null });
    }
  },

  clearError: () => set({ error: null }),
}));
