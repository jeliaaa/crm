import {
  LayoutDashboard,
  Users,
  Kanban,
  Download,
  CalendarClock,
  CalendarDays,
  PhoneCall,
  ListOrdered,
  Receipt,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: boolean;
};

export const NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/called-answered', label: 'Called + answered', icon: PhoneCall, badge: true },
  { href: '/calls', label: 'All the calls', icon: ListOrdered },
  { href: '/follow-ups', label: 'Follow-ups', icon: CalendarClock },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/pipeline', label: 'Pipeline', icon: Kanban },
  { href: '/invoices', label: 'Create an invoice', icon: Receipt },
  { href: '/scrape', label: 'Scrape', icon: Download },
];

// Kept front and center on the mobile bottom bar; everything else in NAV
// lives behind "More" there.
export const MOBILE_PRIMARY_HREFS = ['/', '/contacts', '/pipeline', '/calendar'];
