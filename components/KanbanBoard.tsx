'use client';

import { useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Link from 'next/link';
import { STAGE_ORDER, STAGE_LABELS, STAGE_COLUMN, type Stage } from '@/lib/stages';

type KanbanContact = {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
  category: string | null;
  stage: string;
  website: string | null;
};

const STAGES: { id: Stage; label: string; headerColor: string; bg: string }[] = STAGE_ORDER.map(
  (s) => ({
    id: s,
    label: STAGE_LABELS[s],
    headerColor: STAGE_COLUMN[s].header,
    bg: STAGE_COLUMN[s].bg,
  })
);

function SortableCard({ contact, isDragging }: { contact: KanbanContact; isDragging: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: contact.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
      }}
      {...attributes}
      {...listeners}
      className="bg-white rounded-lg p-3 shadow-sm border border-slate-100 cursor-grab active:cursor-grabbing select-none"
    >
      <Link
        href={`/contacts/${contact.id}`}
        onClick={(e) => e.stopPropagation()}
        className="font-medium text-slate-900 text-sm hover:text-indigo-600 block leading-tight"
      >
        {contact.name}
      </Link>
      {contact.phone && (
        <p className="text-xs text-slate-500 mt-1 font-mono">{contact.phone}</p>
      )}
      {contact.city && <p className="text-xs text-slate-400 mt-0.5">{contact.city}</p>}
      {contact.category && (
        <span className="inline-block mt-1.5 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
          {contact.category}
        </span>
      )}
    </div>
  );
}

function StageColumn({
  stage,
  contacts,
  activeId,
}: {
  stage: (typeof STAGES)[0];
  contacts: KanbanContact[];
  activeId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div
      className={`flex-shrink-0 w-60 flex flex-col rounded-xl border ${
        isOver ? 'border-indigo-400 ring-2 ring-indigo-200' : 'border-slate-200'
      } ${stage.bg} transition-all`}
    >
      <div className="px-3 py-2.5 flex items-center justify-between border-b border-slate-200 bg-white/70 rounded-t-xl">
        <span className={`font-semibold text-sm ${stage.headerColor}`}>{stage.label}</span>
        <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
          {contacts.length}
        </span>
      </div>

      <div ref={setNodeRef} className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[80px]">
        <SortableContext
          items={contacts.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {contacts.map((c) => (
            <SortableCard key={c.id} contact={c} isDragging={c.id === activeId} />
          ))}
        </SortableContext>

        {contacts.length === 0 && (
          <div className="text-center text-xs text-slate-400 py-6">Drop cards here</div>
        )}
      </div>
    </div>
  );
}

export default function KanbanBoard({ initialContacts }: { initialContacts: KanbanContact[] }) {
  const [contacts, setContacts] = useState(initialContacts);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const grouped = STAGES.reduce<Record<string, KanbanContact[]>>((acc, s) => {
    acc[s.id] = contacts.filter((c) => c.stage === s.id);
    return acc;
  }, {});

  const activeContact = contacts.find((c) => c.id === activeId);

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(active.id as string);
  }

  async function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over) return;

    const contact = contacts.find((c) => c.id === active.id);
    if (!contact) return;

    let targetStage = over.id as string;
    if (!STAGES.find((s) => s.id === targetStage)) {
      const overContact = contacts.find((c) => c.id === targetStage);
      if (overContact) targetStage = overContact.stage;
    }

    if (!STAGES.find((s) => s.id === targetStage)) return;
    if (contact.stage === targetStage) return;

    setContacts((prev) =>
      prev.map((c) => (c.id === contact.id ? { ...c, stage: targetStage } : c))
    );

    await fetch(`/api/contacts/${contact.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: targetStage }),
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4 flex-1" style={{ height: 'calc(100vh - 11rem)' }}>
        {STAGES.map((stage) => (
          <StageColumn
            key={stage.id}
            stage={stage}
            contacts={grouped[stage.id] ?? []}
            activeId={activeId}
          />
        ))}
      </div>

      <DragOverlay>
        {activeContact && (
          <div className="bg-white rounded-lg p-3 shadow-xl border border-indigo-200 w-56 rotate-2 opacity-95">
            <p className="font-medium text-slate-900 text-sm">{activeContact.name}</p>
            {activeContact.city && <p className="text-xs text-slate-400 mt-0.5">{activeContact.city}</p>}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
