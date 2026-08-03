import React from 'react';
import TaskHeader from './TaskHeader';
import TaskDescription from './TaskDescription';
import SubtaskChecklist from './SubtaskChecklist';
import TaskSidebar from './TaskSidebar';
import TaskTabs from './TaskTabs';
import { useTaskStore } from '../../../../store/taskStore';
import { useUiStore } from '../../../../store/uiStore';
import { useAuthStore } from '../../../../store/authStore';
import Modal from '../../../../components/common/Modal';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';

const TaskDetailsModal: React.FC = () => {
  const selectedTaskId = useUiStore((state: any) => state.selectedTaskId);
  const isOpen = useUiStore((state: any) => state.isTaskModalOpen);
  const closeTaskModal = useUiStore((state: any) => state.closeTaskModal);

  const [searchParams, setSearchParams] = useSearchParams();
  const [isLoadingTask, setIsLoadingTask] = React.useState(false);
  const prevIsOpen = React.useRef(isOpen);
  const prevTaskId = React.useRef(selectedTaskId);

  const { getColumnsList, getBoardMembersList, boardView, initializeBoard, getTaskById, fetchTaskById } = useTaskStore();
  const columns = getColumnsList();
  const boardMembers = getBoardMembersList();

  const boardId = boardView.boardId;
  const { user } = useAuthStore();

  const task = getTaskById(selectedTaskId || 0);

  // State -> URL sync (only runs when Zustand state changes, not when URL changes independently)
  React.useEffect(() => {
    if (prevIsOpen.current !== isOpen || prevTaskId.current !== selectedTaskId) {
      if (isOpen && selectedTaskId) {
        if (searchParams.get('taskId') !== String(selectedTaskId)) {
          const next = new URLSearchParams(searchParams);
          next.set('taskId', String(selectedTaskId));
          setSearchParams(next, { replace: true });
        }
      } else if (!isOpen) {
        if (searchParams.has('taskId')) {
          const next = new URLSearchParams(searchParams);
          next.delete('taskId');
          setSearchParams(next, { replace: true });
        }
      }
      prevIsOpen.current = isOpen;
      prevTaskId.current = selectedTaskId;
    }
  }, [isOpen, selectedTaskId, searchParams, setSearchParams]);

  // Fetch task if missing from store when modal opens (e.g. from deep link, notification, or search)
  React.useEffect(() => {
    let isMounted = true;
    if (isOpen && selectedTaskId && !task) {
      setIsLoadingTask(true);
      fetchTaskById(selectedTaskId).then((fetchedTask) => {
        if (!isMounted) return;
        setIsLoadingTask(false);
        if (!fetchedTask) {
          toast.error('Task has been deleted or is no longer available');
          closeTaskModal();
        }
      });
    } else {
      setIsLoadingTask(false);
    }
    return () => { isMounted = false; };
  }, [isOpen, selectedTaskId, task, fetchTaskById, closeTaskModal]);

  // Lazy load board data if we opened a task from a different context (like My Work)
  React.useEffect(() => {
    if (isOpen && task && task.board_id !== boardId) {
      initializeBoard(task.board_id);
    }
  }, [isOpen, task?.board_id, boardId, initializeBoard]);

  if (!isOpen) return null;

  if (isLoadingTask) {
    return (
      <Modal isOpen={isOpen} onClose={closeTaskModal} width="max-w-2xl">
        <div className="flex items-center justify-center p-12 space-x-3 text-brand-text-muted">
          <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
          <span>Loading task details...</span>
        </div>
      </Modal>
    );
  }

  if (!task) return null;

  const canEdit = user?.role !== "MEMBER" || task.assigned_to === user?.id;
  const createdDate = new Date(task.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Modal isOpen={isOpen} onClose={closeTaskModal} width="max-w-6xl" noPadding={true}>
      <div className="flex flex-col h-[90vh]">
        <TaskHeader task={task} onClose={closeTaskModal} canEdit={canEdit} />

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 p-8 overflow-y-auto space-y-8">
            <TaskDescription task={task} canEdit={canEdit} />
            <SubtaskChecklist task={task} canEdit={canEdit} />
            <TaskTabs
              task={task}
              currentUserId={user?.id || null}
              users={boardMembers}
            />
          </div>

          <TaskSidebar
            task={task}
            columns={columns}
            boardMembers={boardMembers}
            canEdit={canEdit}
            createdDate={createdDate}
          />
        </div>
      </div>
    </Modal>
  );
};

export default TaskDetailsModal;
