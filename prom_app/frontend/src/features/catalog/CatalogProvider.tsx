import { useUnsavedChanges } from '../../shared/UnsavedChanges';
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Catalog } from '../../domain/catalog';
interface Choice {
  catalog: Catalog;
  name: string;
}
const CatalogContext = createContext<{
  custom: Choice | null;
  exported: string;
  setExported: (id: string) => void;
  setCustom: (value: Choice | null) => void;
} | null>(null);
export function CatalogProvider({ children }: { children: ReactNode }) {
  const [custom, setCustom] = useState<Choice | null>(null);
  const [exported, setExported] = useState('');
  useUnsavedChanges(
    !!custom && exported !== custom.catalog.id,
    'Пользовательский справочник не скачан.',
    false,
  );
  return (
    <CatalogContext.Provider value={{ custom, setCustom, exported, setExported }}>
      {children}
    </CatalogContext.Provider>
  );
}
export function useCatalogChoice() {
  const value = useContext(CatalogContext);
  if (!value) throw new Error('Нет контекста справочника');
  return value;
}

export function useOptionalCatalogChoice() {
  return useContext(CatalogContext);
}
