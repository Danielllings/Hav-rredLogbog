// Web shim for expo-sqlite — provides a no-op in-memory mock on web.
// Real SQLite is not available in the browser.
import React from 'react';

const mockDb = {
  getAllAsync: async () => [],
  getFirstAsync: async () => null,
  runAsync: async () => ({ changes: 0, lastInsertRowId: 0 }),
  execAsync: async () => {},
  closeAsync: async () => {},
  withTransactionAsync: async (fn) => fn(),
  withExclusiveTransactionAsync: async (fn) => fn(),
};

export function openDatabaseAsync() { return Promise.resolve(mockDb); }
export function openDatabaseSync() { return mockDb; }
export function SQLiteProvider({ children }) { return children; }
export function useSQLiteContext() { return mockDb; }
export default { openDatabaseAsync, openDatabaseSync };
