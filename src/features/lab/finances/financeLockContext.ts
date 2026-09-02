import { createContext, useContext } from 'react';

/**
 * Lets the finances page lock itself again from inside the gate.
 *
 * Its own file so the gate stays a components-only module — exporting a hook
 * alongside a component breaks fast refresh for the whole file.
 */
export const LockContext = createContext<{ lock: () => void }>({ lock: () => {} });

export const useFinanceLock = () => useContext(LockContext);
