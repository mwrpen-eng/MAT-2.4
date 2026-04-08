import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { appApi } from '@/api/appApi';
import { initializeEntraAuth, isEntraEnabled, loginWithMicrosoft, logoutFromMicrosoft } from '@/lib/entraAuth';

const AuthContext = createContext();
const defaultSettings = {
  auth_provider: isEntraEnabled ? 'microsoft' : 'local',
  enable_microsoft_login: isEntraEnabled,
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(defaultSettings);

  const checkAppState = useCallback(async () => {
    setIsLoadingPublicSettings(true);
    setIsLoadingAuth(true);
    setAuthError(null);

    try {
      if (isEntraEnabled) {
        await initializeEntraAuth();
      }

      const currentUser = await appApi.auth.me();

      if (isEntraEnabled && currentUser?.provider !== 'microsoft-entra') {
        const configError = new Error('The backend is not yet configured for Microsoft Entra ID token validation.');
        configError.status = 500;
        throw configError;
      }

      setUser(currentUser || { id: 'local-user', name: 'Local User', provider: 'local' });
      setIsAuthenticated(true);
      setAppPublicSettings(defaultSettings);
    } catch (error) {
      if (isEntraEnabled) {
        setUser(null);
        setIsAuthenticated(false);
        setAppPublicSettings(defaultSettings);
        setAuthError({
          type: error?.status === 403 ? 'user_not_registered' : error?.status >= 500 ? 'config_error' : 'auth_required',
          message: error?.message || 'Microsoft sign-in is required.',
        });
      } else {
        console.warn('Local auth check failed, continuing in local mode', error);
        setUser({ id: 'local-user', name: 'Local User', provider: 'local' });
        setIsAuthenticated(true);
        setAppPublicSettings(defaultSettings);
      }
    } finally {
      setIsLoadingAuth(false);
      setIsLoadingPublicSettings(false);
    }
  }, []);

  useEffect(() => {
    checkAppState();
  }, [checkAppState]);

  const logout = async () => {
    setUser(null);
    setIsAuthenticated(false);
    try {
      if (isEntraEnabled) {
        await logoutFromMicrosoft(window.location.origin);
        return;
      }
      await appApi.auth.logout(window.location.href);
    } catch (error) {
      console.warn('Logout fallback', error);
    } finally {
      if (!isEntraEnabled) {
        await checkAppState();
      }
    }
  };

  const navigateToLogin = async () => {
    try {
      if (isEntraEnabled) {
        await loginWithMicrosoft(window.location.href);
        return;
      }
      await appApi.auth.redirectToLogin(window.location.href);
    } catch (error) {
      console.warn('Login fallback', error);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      logout,
      navigateToLogin,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};