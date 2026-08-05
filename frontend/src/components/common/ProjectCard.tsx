import React from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import type { Board } from '../../services/boardsApi';
import { getProjectColorClass, getProjectGradientClass } from '../../utils/projectIdentity';
import { useBoardStore } from '../../store/boardStore';

interface ProjectCardProps {
  board: Partial<Board>;
  onClick?: () => void;
  className?: string;
  isLink?: boolean;
  action?: React.ReactNode;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ board, onClick, className = '', isLink = true, action }) => {
  const colorClass = getProjectColorClass(board.color);
  const gradientClass = getProjectGradientClass(board.cover_gradient);
  const toggleFavorite = useBoardStore(state => state.toggleFavorite);

  const handleStarClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (board.id) {
      toggleFavorite(board.id);
    }
  };

  const content = (
    <div className="relative">
      <div className={`h-24 ${gradientClass} flex-shrink-0`}></div>
      {board.id && (
        <button
          type="button"
          onClick={handleStarClick}
          className="absolute top-3 left-3 z-10 p-1.5 rounded-full bg-black/30 hover:bg-black/50 backdrop-blur-sm transition-colors"
          title={board.is_favorited ? "Remove from favorites" : "Add to favorites"}
        >
          <Star 
            size={16} 
            className={board.is_favorited ? "fill-amber-400 text-amber-400" : "text-white/80 hover:text-white"} 
          />
        </button>
      )}
      {action && (
        <div className="absolute top-3 right-3 z-10">
          {action}
        </div>
      )}

      <div className="p-4 flex flex-col min-w-0">
        <div className="flex items-center gap-3 mb-1">
          {board.icon ? (
            <span className="text-2xl flex-shrink-0 leading-none">{board.icon}</span>
          ) : (
            <div className={`w-6 h-6 rounded flex-shrink-0 ${colorClass}`}></div>
          )}
          <h3 className="text-base font-semibold text-brand-text truncate">
            {board.name || 'Unnamed Project'}
          </h3>
        </div>
        <p className="text-sm text-brand-text-muted line-clamp-2 mt-1 min-h-[40px]">
          {board.description || 'No description provided.'}
        </p>
        <div className="mt-4 flex items-center justify-between text-xs text-brand-text-muted">
          {board.project_key && (
            <span className="font-mono bg-brand-surface-low px-1.5 py-0.5 rounded">
              {board.project_key}
            </span>
          )}
          {board.task_count !== undefined && (
            <span>{board.task_count} tasks</span>
          )}
        </div>
      </div>
    </div>
  );

  const wrapperClass = `block bg-brand-surface border border-brand-border rounded-xl overflow-hidden hover:border-brand-primary/50 transition-colors cursor-pointer group ${className}`;

  if (isLink && board.id) {
    return (
      <Link to={`/board/${board.id}`} className={wrapperClass} onClick={onClick}>
        {content}
      </Link>
    );
  }

  return (
    <div className={wrapperClass} onClick={onClick}>
      {content}
    </div>
  );
};
