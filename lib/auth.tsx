import React,{createContext,useContext,useState} from 'react';
type Auth={user:{id:string;name:string;email:string}|null;signIn:(email:string)=>void;signOut:()=>void}; const C=createContext<Auth|null>(null);
export function AuthProvider({children}:{children:React.ReactNode}){const [user,setUser]=useState<Auth['user']>(null);return <C.Provider value={{user,signIn:(email)=>setUser({id:'u1',name:'Mina Park',email}),signOut:()=>setUser(null)}}>{children}</C.Provider>}; export const useAuth=()=>{const c=useContext(C);if(!c)throw new Error('useAuth must be used inside AuthProvider');return c;};
