import { useQueryClient } from '@tanstack/react-query';
import * as Device from 'expo-device';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { api, setUnauthorizedHandler } from '@/api/client';
import type { ApiItemResponse, User } from '@/api/types';
import { tokenStorage } from '@/lib/storage';

type AuthCtx = {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, confirmation: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | null>(null);

/** Web frontend'deki auth-context.tsx ile aynı akış; token SecureStore'da. */
export function AuthProvider({ children, apiReady }: { children: ReactNode; apiReady: boolean }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const signOutLocally = useCallback(() => {
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    setUnauthorizedHandler(signOutLocally);
    return () => setUnauthorizedHandler(null);
  }, [signOutLocally]);

  // API adresi ayarlardan yüklendikten SONRA mevcut token doğrulanır.
  useEffect(() => {
    if (!apiReady) return;
    (async () => {
      const token = await tokenStorage.get();
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const res = await api.get<ApiItemResponse<User>>('/auth/me');
        setUser(res.data);
      } catch {
        // Ağ hatasında token'ı silmiyoruz (sunucu geçici kapalı olabilir);
        // 401 ise client zaten temizledi.
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [apiReady]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<ApiItemResponse<{ user: User; token: string }>>(
      '/auth/login',
      { email, password, device_name: Device.deviceName ?? Device.modelName ?? 'mobile' },
      false,
    );
    await tokenStorage.set(res.data.token);
    setUser(res.data.user);
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string, confirmation: string) => {
      await api.post('/auth/register', { name, email, password, password_confirmation: confirmation }, false);
      await login(email, password);
    },
    [login],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // token zaten geçersizse sorun değil
    }
    await tokenStorage.clear();
    signOutLocally();
  }, [signOutLocally]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
