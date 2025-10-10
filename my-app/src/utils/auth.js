const AUTH_KEY = 'auth';

export const saveAuth = (authObj) => {
  localStorage.setItem(AUTH_KEY, JSON.stringify(authObj));
};

export const getAuth = () => {
  const raw = localStorage.getItem(AUTH_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const getUserId = () => {
  const auth = getAuth();
  return auth?.userId ?? null;
};

export const getUserRol = () => {
  const auth = getAuth();
  if (!auth) return null;
  const r = auth.roleId;
  return typeof r === 'string' ? parseInt(r, 10) : r;
};

export const clearAuth = () => {
  localStorage.removeItem(AUTH_KEY);
};

export const isAuthentication = () => {
  const auth = getAuth();
  return !!auth?.userId;
};

export const rolAuth = (allowedRoles = []) => {
  if (!Array.isArray(allowedRoles)) return false;
  const r = getUserRol();
  return r != null && allowedRoles.includes(r);
};
