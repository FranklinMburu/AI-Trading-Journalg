import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { TradingAccount } from '../types';

interface AccountContextType {
  user: User | null;
  accounts: TradingAccount[];
  userAccounts: TradingAccount[];
  activeAccount: TradingAccount | null;
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

  useEffect(() => {
    if (!user) return;

    setIsLoading(true);
    // In the new architecture, accounts are stored at users/{userId}/accounts
    const accountsRef = collection(db, 'users', user.uid, 'accounts');
    const q = query(accountsRef, orderBy('lastUpdate', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const accList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TradingAccount));
      setAccounts(accList);
      
      if (!selectedAccountId && accList.length > 0) {
        const firstId = accList[0].id;
        setSelectedAccountId(firstId);
        localStorage.setItem('tradeflow_selected_account', firstId);
      }
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/accounts`);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleSetSelectedAccountId = (id: string | null) => {
    setSelectedAccountId(id);
    if (id) {
      localStorage.setItem('tradeflow_selected_account', id);
    } else {
      localStorage.removeItem('tradeflow_selected_account');
    }
  };

  const activeAccount = accounts.find(a => a.id === selectedAccountId) || null;

  return (
    <AccountContext.Provider value={{
      user,
      accounts,
      userAccounts: accounts,
      activeAccount,
      selectedAccountId,
      setSelectedAccountId: handleSetSelectedAccountId,
      isDemoMode,
      setIsDemoMode,
      isAdmin,
      isLoading
    }}>
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
