// @ts-nocheck
/// <reference types="vite/client" />
import { InteractionRequiredAuthError, PublicClientApplication } from '@azure/msal-browser';

const AUTH_MODE = import.meta.env.VITE_AUTH_MODE || 'local';
const TENANT_ID = import.meta.env.VITE_ENTRA_TENANT_ID || '';
const CLIENT_ID = import.meta.env.VITE_ENTRA_CLIENT_ID || '';
const AUTHORITY = import.meta.env.VITE_ENTRA_AUTHORITY || (TENANT_ID ? `https://login.microsoftonline.com/${TENANT_ID}` : '');
const REDIRECT_URI = import.meta.env.VITE_ENTRA_REDIRECT_URI || (typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:5173');
const POST_LOGOUT_REDIRECT_URI = import.meta.env.VITE_ENTRA_POST_LOGOUT_REDIRECT_URI || REDIRECT_URI;
const RAW_API_SCOPES = import.meta.env.VITE_ENTRA_API_SCOPE || import.meta.env.VITE_ENTRA_SCOPES || '';
const API_SCOPES = RAW_API_SCOPES
  ? RAW_API_SCOPES.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean)
  : ['openid', 'profile', 'email'];
const LOGIN_SCOPES = Array.from(new Set(['openid', 'profile', 'email', ...API_SCOPES]));

export const isEntraEnabled = AUTH_MODE === 'entra' && Boolean(TENANT_ID && CLIENT_ID);

let msalInstance = null;
let initializePromise = null;

const getMsalInstance = () => {
  if (!isEntraEnabled) return null;
  if (!msalInstance) {
    msalInstance = new PublicClientApplication({
      auth: {
        clientId: CLIENT_ID,
        authority: AUTHORITY,
        redirectUri: REDIRECT_URI,
        postLogoutRedirectUri: POST_LOGOUT_REDIRECT_URI,
        navigateToLoginRequestUrl: true,
      },
      cache: {
        cacheLocation: 'localStorage',
        storeAuthStateInCookie: false,
      },
    });
  }
  return msalInstance;
};

export const initializeEntraAuth = async () => {
  if (!isEntraEnabled) return null;
  if (!initializePromise) {
    initializePromise = (async () => {
      const instance = getMsalInstance();
      await instance.initialize();
      const response = await instance.handleRedirectPromise();
      const activeAccount = response?.account || instance.getActiveAccount() || instance.getAllAccounts()[0] || null;
      if (activeAccount) {
        instance.setActiveAccount(activeAccount);
      }
      return instance;
    })().catch((error) => {
      initializePromise = null;
      throw error;
    });
  }
  return initializePromise;
};

export const getActiveEntraAccount = async () => {
  const instance = await initializeEntraAuth();
  if (!instance) return null;
  return instance.getActiveAccount() || instance.getAllAccounts()[0] || null;
};

export const getAccessToken = async () => {
  if (!isEntraEnabled) return null;

  const instance = await initializeEntraAuth();
  const account = instance.getActiveAccount() || instance.getAllAccounts()[0] || null;
  if (!account) return null;

  try {
    const response = await instance.acquireTokenSilent({
      account,
      scopes: API_SCOPES,
    });

    if (response?.account) {
      instance.setActiveAccount(response.account);
    }

    return response?.accessToken || null;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      await instance.acquireTokenRedirect({
        account,
        scopes: API_SCOPES,
        redirectStartPage: typeof window !== 'undefined' ? window.location.href : REDIRECT_URI,
      });
      return null;
    }
    throw error;
  }
};

export const loginWithMicrosoft = async (fromUrl) => {
  if (!isEntraEnabled) {
    throw new Error('Microsoft Entra ID is not configured.');
  }

  const instance = await initializeEntraAuth();
  const account = instance.getActiveAccount() || instance.getAllAccounts()[0] || null;
  if (account) {
    instance.setActiveAccount(account);
    return account;
  }

  await instance.loginRedirect({
    scopes: LOGIN_SCOPES,
    prompt: 'select_account',
    redirectStartPage: fromUrl || (typeof window !== 'undefined' ? window.location.href : REDIRECT_URI),
  });

  return null;
};

export const logoutFromMicrosoft = async (fromUrl) => {
  if (!isEntraEnabled) return;
  const instance = await initializeEntraAuth();
  await instance.logoutRedirect({
    account: instance.getActiveAccount() || instance.getAllAccounts()[0] || undefined,
    postLogoutRedirectUri: fromUrl || POST_LOGOUT_REDIRECT_URI,
  });
};

export const getEntraConfigStatus = () => ({
  authMode: AUTH_MODE,
  enabled: isEntraEnabled,
  tenantId: TENANT_ID,
  clientId: CLIENT_ID,
  apiScopes: API_SCOPES,
});
