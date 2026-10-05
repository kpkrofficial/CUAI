"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  BarChart2, 
  Folder, 
  Users, 
  ShieldCheck, 
  Bot,
  ExternalLink,
  Activity,
  GraduationCap,
  Download,
  Sparkles,
  HardDrive,
  Settings,
  KeyRound,
  X
} from "lucide-react";

interface AdminSidebarProps {
  onLogout?: () => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export default function AdminSidebar({ onLogout, isOpenMobile = false, onCloseMobile }: AdminSidebarProps) {
  const pathname = usePathname();

  const navItems = [
    { label: "Dashboard", href: "/admin/dashboard", icon: BarChart2 },
    { label: "AI Learning & Feedback", href: "/admin/ai-learning", icon: Bot },
    { label: "Folders & Intake", href: "/admin/folders", icon: Folder },
    { label: "Students", href: "/admin/students", icon: GraduationCap },
    { label: "Export Data", href: "/admin/export", icon: Download },
    { label: "Users", href: "/admin/users", icon: Users },
    { label: "Storage", href: "/admin/storage", icon: HardDrive },
    { label: "Settings", href: "/admin/settings", icon: Settings },
    { label: "Logins & Access", href: "/admin/logins", icon: KeyRound },
    { label: "System Status", href: "/admin/system", icon: Activity },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-[240px] h-screen overflow-hidden bg-white text-[#0a0a0a] border-r border-[#e3e4e8] flex flex-col flex-shrink-0 select-none shadow-[0_1px_3px_rgba(0,0,0,0.02)] transition-transform duration-200 ease-in-out ${
          isOpenMobile ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Brand & Logo Header - Compact 56px */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-[#e3e4e8] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <img 
                src="/logo.png" 
                alt="CityApp Logo" 
                className="w-7 h-7 rounded-lg object-cover shadow-2xs ring-1 ring-black/5 flex-shrink-0" 
              />
              <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-[#0a66ff] rounded-full ring-2 ring-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[11px] font-bold text-[#0a0a0a] tracking-wider uppercase font-mono leading-none">
                CAMPUS ADMIN
              </h2>
              <p className="text-[9.5px] text-[#8a8a8e] font-medium mt-0.5 truncate">
                AI Operations Console
              </p>
            </div>
          </div>

          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="p-1 rounded-lg text-[#8a8a8e] hover:text-[#0a0a0a] hover:bg-[#f5f5f7] lg:hidden cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Navigation Links - Compact 7px vertical padding per item, fits without scrolling */}
        <div className="flex-1 px-2.5 py-2.5 space-y-1 flex flex-col justify-between overflow-hidden">
          <div className="space-y-0.5">
            <div className="px-2 pb-1 text-[9px] font-bold text-[#8a8a8e] uppercase tracking-wider">
              Management
            </div>

            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== "/admin/dashboard" && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onCloseMobile}
                  className={`h-[32px] flex items-center gap-2.5 px-2.5 rounded-xl text-[11.5px] transition-all duration-150 ${
                    isActive
                      ? "bg-white text-[#0a66ff] font-bold border border-[#0a66ff]/20 shadow-[0_2px_8px_rgba(10,102,255,0.08)] translate-x-0.5"
                      : "text-[#636366] hover:text-[#0a0a0a] hover:bg-[#f5f5f7] hover:translate-x-0.5 border border-transparent font-medium"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? "text-[#0a66ff]" : "text-[#8a8a8e]"}`} />
                  <span className="truncate">{item.label}</span>
                  {isActive && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#0a66ff]" />
                  )}
                </Link>
              );
            })}

            <div className="pt-2 px-2 pb-1 text-[9px] font-bold text-[#8a8a8e] uppercase tracking-wider">
              Student Portal
            </div>

            <Link
              href="/chat"
              className="h-[32px] flex items-center justify-between px-2.5 rounded-xl text-[11.5px] font-medium text-[#636366] hover:text-[#0a0a0a] hover:bg-[#f5f5f7] border border-transparent hover:border-[#e3e4e8] transition-all group hover:translate-x-0.5"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-4 h-4 rounded-md bg-[#0a66ff]/[0.08] text-[#0a66ff] flex items-center justify-center flex-shrink-0">
                  <Bot className="w-3 h-3" />
                </div>
                <span>Student Chatbot</span>
              </div>
              <ExternalLink className="w-3 h-3 text-[#8a8a8e] group-hover:text-[#0a0a0a] transition-colors" />
            </Link>
          </div>

          {/* Footer Info with Single Cool Accent Live Sync Dot */}
          <div className="p-2.5 rounded-xl bg-[#fafafc] border border-[#e3e4e8] shadow-2xs mt-auto">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-bold text-[#0a0a0a] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0a66ff] animate-pulse" />
                Live Sync
              </span>
              <span className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded-md bg-white border border-[#e3e4e8] text-[#8a8a8e]">
                v2.4
              </span>
            </div>
            <p className="text-[9.5px] text-[#8a8a8e] mt-1 leading-tight truncate">
              Grounded AI Engine
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
