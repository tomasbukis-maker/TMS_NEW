import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type ModuleType = 'transport' | 'expenses';

interface ModuleContextType {
  activeModule: ModuleType;
  setActiveModule: (module: ModuleType) => void;
}

const ModuleContext = createContext<ModuleContextType | undefined>(undefined);

export const ModuleProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeModule, setActiveModuleState] = useState<ModuleType>(() => {
    // Load from localStorage
    const saved = localStorage.getItem('activeModule');
    return (saved as ModuleType) || 'transport';
  });

  const setActiveModule = (module: ModuleType) => {
    setActiveModuleState(module);
    localStorage.setItem('activeModule', module);
  };

  useEffect(() => {
    // Persist to localStorage whenever it changes
    localStorage.setItem('activeModule', activeModule);
  }, [activeModule]);

  return (
    <ModuleContext.Provider value={{ activeModule, setActiveModule }}>
      {children}
    </ModuleContext.Provider>
  );
};

export const useModule = (): ModuleContextType => {
  const context = useContext(ModuleContext);
  if (!context) {
    throw new Error('useModule must be used within a ModuleProvider');
  }
  return context;
};

