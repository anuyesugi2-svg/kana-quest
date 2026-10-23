// Hash routing (works on GitHub Pages without server config).

import { useEffect, useState } from 'preact/hooks';

export function currentPath(): string {
  return location.hash.replace(/^#/, '') || '/';
}

export function useRoute(): string[] {
  const [path, setPath] = useState(currentPath());
  useEffect(() => {
    const on = () => {
      setPath(currentPath());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return path.split('/').filter(Boolean).map(decodeURIComponent);
}

export function go(path: string) {
  location.hash = path;
}

export function href(path: string): string {
  return `#${path}`;
}
