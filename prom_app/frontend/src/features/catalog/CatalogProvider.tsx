import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Catalog } from '../../domain/catalog';
interface Choice {
  catalog: Catalog;
  name: string;
}
const CatalogContext = createContext<{
  custom: Choice | null;
  setCustom: (value: Choice | null) => void;
} | null>(null);
export function CatalogProvider({ children }: { children: ReactNode }) {
  const [custom, setCustom] = useState<Choice | null>(null);
  return <CatalogContext.Provider value={{ custom, setCustom }}>{children}</CatalogContext.Provider>;
}
export function useCatalogChoice() {
  const value = useContext(CatalogContext);
  if (!value) throw new Error('Нет контекста справочника');
  return value;
}
