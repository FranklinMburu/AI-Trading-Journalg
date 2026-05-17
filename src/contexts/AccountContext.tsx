import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc, setDoc, updateDoc, getDocs, limit } from 'firebase/firestore';
import { TradingAccount } from '../types';

interface AccountContextType {
  user: User | null;
  accounts: TradingAccount[];
  userAccounts: TradingAccount[];
  activeAccount: TradingAccount | null;
  accountsWithTrades: string[];
  selectedAccountId: string | null;
  setSelectedAccountId: (id: string | null) => void;
  isDemoMode: boolean;
  setIsDemoMode: (val: boolean) => void;
  isAdmin: boolean;
  isLoading: boolean;
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(localStorage.getItem('tradeflow_selected_account'));
  const [isDemoMode, setIsDemoMode] = useState(() => localStorage.getItem('nexus_demo_mode') === 'true');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    localStorage.setItem('nexus_demo_mode', isDemoMode.toString());
  }, [isDemoMode]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      setUser(authUser);
      if (authUser) {
        // Sync user profile and check admin status
        const userRef = doc(db, 'users', authUser.uid);
        try {
          const userDoc = await getDoc(userRef);
          const now = new Date().toISOString();
          const isDefaultAdmin = authUser.email === 'franklinmburu05@gmail.com' || authUser.email === 'franklinvidal198@gmail.com';
          
          if (!userDoc.exists()) {
            await setDoc(userRef, {
              email: authUser.email,
              displayName: authUser.displayName,
              photoURL: authUser.photoURL,
              role: isDefaultAdmin ? 'admin' : 'user',
              createdAt: now,
              lastLogin: now
            });
            setIsAdmin(isDefaultAdmin);
          } else {
            const userData = userDoc.data();
            const shouldBeAdmin = isDefaultAdmin || userData.role === 'admin';
            setIsAdmin(shouldBeAdmin);
            await updateDoc(userRef, {
              lastLogin: now,
              displayName: authUser.displayName,
              photoURL: authUser.photoURL,
              role: shouldBeAdmin ? 'admin' : 'user'
            });
          }
        } catch (error) {
          console.error("Error syncing user profile:", error);
        }
      } else {
        setAccounts([]);
        setIsAdmin(false);
        setIsLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const [accountsWithTrades, setAccountsWithTrades] = useState<string[]>([]);

  useEffect(() => {
    if (!user || accounts.length === 0) {
      setAccountsWithTrades([]);
      return;
    }

    const checkTrades = async () => {
      const activeIds: string[] = [];
      for (const acc of accounts) {
        try {
          const q = query(collection(db, 'users', user.uid, 'accounts', acc.id, 'trades'), limit(1));
          const snap = await getDocs(q);
          if (!snap.empty) {
            activeIds.push(acc.id);
          }
        } catch (e) {
          // Ignore errors for individual account checks (could be permission issues on specific docs)
        }
      }
      setAccountsWithTrades(activeIds);
    };

    checkTrades();
    // Re-check periodically or when accounts list changes
    const interval = setInterval(checkTrades, 30000);
    return () => clearInterval(interval);
  }, [user, accounts.length]);

  /* Auto-switching disabled for forensic debugging */
  /*
  useEffect(() => {
    if (isLoading || accounts.length === 0) return;
    ...
  }, [isDemoMode, accounts.length, isLoading]);
  */

  useEffect(() => {
    if (!user) return;

    setIsLoading(true);
    // In the new architecture, accounts are stored at users/{userId}/accounts
    const accountsRef = collection(db, 'users', user.uid, 'accounts');
    const q = query(accountsRef, orderBy('lastUpdate', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allDocs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TradingAccount));
      
      // Forensic Debugging: Temporarily show ALL account documents to find missing MT5 syncs
      console.log("[AccountContext] Raw Firestore Account Docs:", allDocs.map(a => ({ id: a.id, acc: a.accountNumber })));
      const validAccounts = allDocs;

      setAccounts(validAccounts);
      
    // Select the most appropriate account
      setSelectedAccountId(prev => {
        console.log("[AccountContext] Accounts Visible:", validAccounts.map(a => `${a.id} (Number: ${a.accountNumber})`).join(', '));
        
        if (validAccounts.length === 0) return null;

        // If we already have a selection, keep it (Forensic Debugging: Stop switching away)
        const currentAcc = validAccounts.find(a => a.id === prev);
        if (currentAcc) return prev;

        // Otherwise, first available account
        const preferredAccount = validAccounts[0];
        localStorage.setItem('tradeflow_selected_account', preferredAccount.id);
        return preferredAccount.id;
      });
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/accounts`);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user, isDemoMode]);

  const handleSetSelectedAccountId = React.useCallback((id: string | null) => {
    setSelectedAccountId(id);
    if (id) {
      localStorage.setItem('tradeflow_selected_account', id);
    } else {
      localStorage.removeItem('tradeflow_selected_account');
    }
  }, []);

  const activeAccount = React.useMemo(() => 
    accounts.find(a => a.id === selectedAccountId) || null
  , [accounts, selectedAccountId]);

  const contextValue = React.useMemo(() => ({
    user,
    accounts,
    userAccounts: accounts,
    activeAccount,
    accountsWithTrades,
    selectedAccountId,
    setSelectedAccountId: handleSetSelectedAccountId,
    isDemoMode,
    setIsDemoMode,
    isAdmin,
    isLoading
  }), [
    user, 
    accounts, 
    activeAccount,
    accountsWithTrades,
    selectedAccountId, 
    handleSetSelectedAccountId, 
    isDemoMode, 
    setIsDemoMode,
    isAdmin, 
    isLoading
  ]);

  return (
    <AccountContext.Provider value={contextValue}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const context = useContext(AccountContext);
  if (context === undefined) {
    throw new Error('useAccount must be used within an AccountProvider');
  }
  return context;
}
