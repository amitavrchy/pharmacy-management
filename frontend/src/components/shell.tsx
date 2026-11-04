'use client';
import Link from 'next/link';
import {usePathname,useRouter} from 'next/navigation';
import {useEffect,useState,ReactNode} from 'react';
import {LayoutDashboard,ScanLine,Pill,Package,ShoppingBag,FileHeart,RotateCcw,Bell,ChartNoAxesCombined,Settings,RefreshCw,LogOut,Plus,Menu,X,ShieldCheck,ChevronDown,ArrowUpRight} from 'lucide-react';
import {useApp} from './providers';
import {Loading} from './ui';
const nav=[{href:'/',label:'Overview',icon:LayoutDashboard},{href:'/pos',label:'Point of sale',icon:ScanLine},{href:'/catalog',label:'Medicine catalog',icon:Pill},{href:'/inventory',label:'Inventory',icon:Package},{href:'/purchasing',label:'Purchasing',icon:ShoppingBag,roles:['OWNER','STORE_KEEPER','AUDITOR']},{href:'/prescriptions',label:'Prescriptions',icon:FileHeart},{href:'/returns',label:'Returns & recalls',icon:RotateCcw},{href:'/alerts',label:'Alerts',icon:Bell},{href:'/reports',label:'Reports',icon:ChartNoAxesCombined},{href:'/sync',label:'Offline sync',icon:RefreshCw}];
export function Shell({children}:{children:ReactNode}){
  const {user,loading,logout}=useApp(),path=usePathname(),router=useRouter(),[open,setOpen]=useState(false),[online,setOnline]=useState(true);
  useEffect(()=>{if(!loading&&!user)router.replace('/login');},[user,loading,router]);
  useEffect(()=>{const update=()=>setOnline(navigator.onLine);update();window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[]);
  useEffect(()=>setOpen(false),[path]);
  if(loading||!user)return <div className="auth-loading"><Loading/></div>;
  const current=nav.find(n=>n.href===path);
  return <div className="app"><a className="skip-link" href="#main">Skip to content</a>{open&&<button aria-label="Close navigation" className="sidebar-scrim" onClick={()=>setOpen(false)}/>}
    <aside className={`sidebar ${open?'is-open':''}`}><Link className="brand" href="/"><span className="brand-icon"><Plus strokeWidth={3} size={27}/></span><span>medora<span className="brand-period">.</span><small>PHARMACY WORKSPACE</small></span></Link>
      <div className="shop-switch"><div className="shop-avatar">M</div><div><strong>{user.shop.name}</strong><span>Dhaka, Bangladesh</span></div><ChevronDown size={17}/></div>
      <div className="nav-label">WORKSPACE</div><nav>{nav.filter(n=>!n.roles||n.roles.includes(user.role)).map(n=><Link className={`nav-link ${path===n.href?'active':''}`} key={n.href} href={n.href}><n.icon size={20}/><span>{n.label}</span>{path===n.href&&<span className="active-dot"/>}</Link>)}</nav>
      <div className="sidebar-bottom"><div className="trust-card"><ShieldCheck size={23}/><strong>Care starts with clarity.</strong><p>Every batch. Every prescription.<br/>Every patient.</p><Link href="/inventory">Keep stock in check <ArrowUpRight size={16}/></Link></div>{user.role==='OWNER'&&<Link href="/settings" className={`nav-link ${path==='/settings'?'active':''}`}><Settings size={20}/>Settings & team</Link>}<button className="profile" onClick={logout} title="Sign out"><span className="avatar">{user.name.split(' ').map((s:string)=>s[0]).slice(0,2).join('')}</span><span><strong>{user.name}</strong><small>{user.role.replace('_',' ').toLowerCase()}</small></span><LogOut size={18}/></button></div>
    </aside><div className="workspace"><header className="topbar"><div className="breadcrumb"><button className="icon-btn mobile-menu" aria-label="Open navigation" onClick={()=>setOpen(!open)}>{open?<X/>:<Menu/>}</button><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{current?.label||'Settings & team'}</strong></div><div className="topbar-right"><span className={`connection ${online?'':'offline'}`}><i/>{online?'System online':'Working offline'}</span><span className="topbar-divider"/><Link className="icon-btn" href="/alerts" aria-label="View alerts"><Bell size={20}/></Link><span className="avatar avatar-small">{user.name[0]}</span></div></header><main id="main" className="main" key={path}>{children}</main><footer className="workspace-footer"><span>Medora · A little more care, every day.</span><span>Asia/Dhaka · BDT ৳</span></footer></div>
  </div>;
}
