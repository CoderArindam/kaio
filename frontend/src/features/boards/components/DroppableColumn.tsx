import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { type Column } from '../../../services/tasksApi';

interface DroppableColumnProps {
  column: Column;
  children: React.ReactNode;
}

export const DroppableColumn: React.FC<DroppableColumnProps> = ({ column, children }) => {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${column.id}` });
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 flex flex-col space-y-3 min-h-[160px] p-2 sm:p-2.5 transition-all duration-150 ${
        isOver ? 'bg-brand-primary/10 ring-2 ring-brand-primary/40' : ''
      }`}
    >
      {children}
    </div>
  );
};

export default DroppableColumn;
