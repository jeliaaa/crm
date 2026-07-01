import FollowUpCalendar from '@/components/FollowUpCalendar';
import { CalendarDays } from 'lucide-react';

export default function CalendarPage() {
  return (
    <div className="p-8">
      <div className="flex items-center gap-2 mb-6">
        <CalendarDays className="text-indigo-600" size={22} />
        <h1 className="text-2xl font-bold text-slate-900">Calendar</h1>
      </div>
      <FollowUpCalendar />
    </div>
  );
}
