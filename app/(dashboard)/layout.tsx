import Sidebar from '@/components/Sidebar';
import MobileNav from '@/components/MobileNav';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar />
      <MobileNav>{children}</MobileNav>
    </div>
  );
}
