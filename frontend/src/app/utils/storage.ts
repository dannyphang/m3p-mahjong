export function setLocalItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn('Error setting local storage item', e);
  }
}

export function getLocalItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    console.warn('Error getting local storage item', e);
    return null;
  }
}
