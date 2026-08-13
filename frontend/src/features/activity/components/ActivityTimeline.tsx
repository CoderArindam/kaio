import React, { useEffect, useState, useMemo } from "react";
import { useActivityStore } from "../../../store/activityStore";
import type { Activity } from "../../../services/activityApi";
import { ACTIVITY_TYPES } from "../../../constants/activityTypes";
import { formatActivity } from "../utils/activityFormatter";
import ActivityGroup from "./ActivityGroup";
import ActivitySkeleton from "./ActivitySkeleton";
import ActivityEmptyState from "./ActivityEmptyState";
import {
  Search,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Loader2,
} from "lucide-react";

interface ActivityTimelineProps {
  taskId: number;
}

// Helper to group activities by date
const groupActivities = (activities: Activity[], sortOrder: "desc" | "asc") => {
  const groups: Record<string, Activity[]> = {};

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  activities.forEach((activity) => {
    const activityDate = new Date(activity.created_at);
    const dateOnly = new Date(activityDate);
    dateOnly.setHours(0, 0, 0, 0);

    let label = "";
    if (dateOnly.getTime() === today.getTime()) {
      label = "Today";
    } else if (dateOnly.getTime() === yesterday.getTime()) {
      label = "Yesterday";
    } else if (today.getTime() - dateOnly.getTime() < 7 * 24 * 60 * 60 * 1000) {
      label = "Earlier this week";
    } else if (
      today.getTime() - dateOnly.getTime() <
      30 * 24 * 60 * 60 * 1000
    ) {
      label = "Earlier this month";
    } else {
      label = activityDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }

    if (!groups[label]) {
      groups[label] = [];
    }
    groups[label].push(activity);
  });

  // Sort groups by date if needed, though they are usually populated in order
  const sortedLabels = Object.keys(groups).sort((a, b) => {
    // If it's a known string like Today, it should be at top for 'desc'
    const getScore = (l: string) => {
      if (l === "Today") return 0;
      if (l === "Yesterday") return 1;
      if (l === "Earlier this week") return 2;
      if (l === "Earlier this month") return 3;
      return 4; // for specific dates, we can rely on parsing or assume it's older
    };

    // For specific dates, we should parse them.
    const isDateA = ![
      "Today",
      "Yesterday",
      "Earlier this week",
      "Earlier this month",
    ].includes(a);
    const isDateB = ![
      "Today",
      "Yesterday",
      "Earlier this week",
      "Earlier this month",
    ].includes(b);

    if (isDateA && isDateB) {
      const timeA = new Date(a).getTime();
      const timeB = new Date(b).getTime();
      return sortOrder === "desc" ? timeB - timeA : timeA - timeB;
    }

    const scoreA = getScore(a);
    const scoreB = getScore(b);
    return sortOrder === "desc" ? scoreA - scoreB : scoreB - scoreA;
  });

  const sortedGroups: Record<string, Activity[]> = {};
  sortedLabels.forEach((label) => {
    sortedGroups[label] = groups[label];
  });

  return sortedGroups;
};

type FilterCategory = "all" | "comments" | "status" | "attachments" | "details";

const filterCategories = [
  { id: "all", label: "All" },
  { id: "comments", label: "Comments" },
  { id: "status", label: "Status & Assg" },
  { id: "attachments", label: "Files" },
  { id: "details", label: "Details" },
] as const;

const ActivityTimeline: React.FC<ActivityTimelineProps> = ({ taskId }) => {
  const { activitiesByTask, loading, error, fetchActivity, hasMoreByTask } =
    useActivityStore();
  const activities = activitiesByTask[taskId];
  const isLoading = loading[taskId];
  const errorMessage = error[taskId];
  const hasMore = hasMoreByTask[taskId];

  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [activeFilter, setActiveFilter] = useState<FilterCategory>("all");

  useEffect(() => {
    // Only fetch if we don't have activities for this task yet
    if (!activities && !isLoading && !errorMessage) {
      fetchActivity(taskId);
    }
  }, [taskId, activities, isLoading, errorMessage, fetchActivity]);

  useEffect(() => {
    const handleUpdate = (e: any) => {
      const detail = e.detail;
      // If the event corresponds to this task, refresh activity
      if (detail && (detail.task_id === taskId || detail.id === taskId)) {
        fetchActivity(taskId, 50, true);
      } else if (!detail) {
        // Fallback if no detail is provided
        fetchActivity(taskId, 50, true);
      }
    };

    window.addEventListener("kaio:task_updated", handleUpdate);
    window.addEventListener("kaio:comment_updated", handleUpdate);

    return () => {
      window.removeEventListener("kaio:task_updated", handleUpdate);
      window.removeEventListener("kaio:comment_updated", handleUpdate);
    };
  }, [taskId, fetchActivity]);

  const handleLoadMore = () => {
    if (!isLoading) {
      fetchActivity(taskId, 50, false);
    }
  };

  const filteredActivities = useMemo(() => {
    if (!activities) return [];

    let result = [...activities];

    // 1. Filter by category
    if (activeFilter !== "all") {
      result = result.filter((activity) => {
        const type = activity.activity_type;
        switch (activeFilter) {
          case "comments":
            return ([
              ACTIVITY_TYPES.COMMENT_ADDED,
              ACTIVITY_TYPES.COMMENT_DELETED,
              ACTIVITY_TYPES.COMMENT_UPDATED,
              ACTIVITY_TYPES.MENTIONED_IN_COMMENT,
              ACTIVITY_TYPES.COMMENT_REPLIED,
              ACTIVITY_TYPES.COMMENT_REACTION_ADDED,
              ACTIVITY_TYPES.COMMENT_REACTION_REMOVED,
            ] as string[]).includes(type);
          case "status":
            return ([
              ACTIVITY_TYPES.STATUS_CHANGED,
              ACTIVITY_TYPES.ASSIGNEE_CHANGED,
              ACTIVITY_TYPES.REPORTER_CHANGED,
            ] as string[]).includes(type);
          case "attachments":
            return ([
              ACTIVITY_TYPES.ATTACHMENT_ADDED,
              ACTIVITY_TYPES.ATTACHMENT_REMOVED,
            ] as string[]).includes(type);
          case "details":
            return ([
              ACTIVITY_TYPES.TITLE_CHANGED,
              ACTIVITY_TYPES.DESCRIPTION_CHANGED,
              ACTIVITY_TYPES.PRIORITY_CHANGED,
              ACTIVITY_TYPES.DUE_DATE_CHANGED,
              ACTIVITY_TYPES.TIME_LOGGED,
              ACTIVITY_TYPES.ESTIMATE_CHANGED,
              ACTIVITY_TYPES.LABEL_ADDED,
              ACTIVITY_TYPES.LABEL_REMOVED,
            ] as string[]).includes(type);
          default:
            return true;
        }
      });
    }

    // 2. Search filtering
    if (searchQuery.trim()) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter((activity) => {
        // Simple search inside actor name or formatted description
        const formatted = formatActivity(activity);

        // Extract string from ReactNode description if possible
        let descText = "";
        if (typeof formatted.description === "string") {
          descText = formatted.description;
        } else if (React.isValidElement(formatted.description)) {
          // Basic stringification for search
          const extractText = (node: any): string => {
            if (typeof node === "string") return node;
            if (Array.isArray(node)) return node.map(extractText).join("");
            if (node && node.props && node.props.children)
              return extractText(node.props.children);
            return "";
          };
          descText = extractText(formatted.description);
        }

        return (
          descText.toLowerCase().includes(lowerQuery) ||
          (activity.actor_first_name &&
            activity.actor_first_name.toLowerCase().includes(lowerQuery))
        );
      });
    }

    // 3. Sorting
    if (sortOrder === "asc") {
      result.reverse();
    }

    return result;
  }, [activities, activeFilter, searchQuery, sortOrder]);

  if (errorMessage) {
    return (
      <div className="p-4 text-center text-sm text-red-500 bg-red-500/10 rounded-lg">
        {errorMessage}
      </div>
    );
  }

  if (isLoading && !activities) {
    return (
      <div className="space-y-6 pt-2">
        <ActivitySkeleton />
        <ActivitySkeleton />
        <ActivitySkeleton />
      </div>
    );
  }

  const grouped = groupActivities(filteredActivities, sortOrder);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Filters and Controls */}
      <div className="flex flex-col gap-3 pb-4 border-b border-brand-border sticky top-0 bg-brand-surface z-20">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" />
            <input
              type="text"
              placeholder="Search activity..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-brand-surface-low border border-brand-border rounded-md focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
          </div>
          <button
            onClick={() =>
              setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))
            }
            className="p-1.5 text-brand-text-muted hover:text-brand-text-primary hover:bg-brand-surface-hover rounded-md transition-colors"
            title={sortOrder === "desc" ? "Newest First" : "Oldest First"}
          >
            {sortOrder === "desc" ? (
              <ArrowDownWideNarrow className="w-4 h-4" />
            ) : (
              <ArrowUpNarrowWide className="w-4 h-4" />
            )}
          </button>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {filterCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveFilter(cat.id as FilterCategory)}
              className={`px-3 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${
                activeFilter === cat.id
                  ? "bg-brand-primary/10 text-brand-primary font-medium border border-brand-primary/20"
                  : "bg-brand-surface-low text-brand-text-muted border border-brand-border hover:text-brand-text-primary"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pt-4 flex-1 overflow-y-auto min-h-[300px] no-scrollbar pb-10">
        {!filteredActivities || filteredActivities.length === 0 ? (
          <ActivityEmptyState />
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {Object.entries(grouped).map(([dateLabel, groupActivities]) => (
              <ActivityGroup
                key={dateLabel}
                dateLabel={dateLabel}
                activities={groupActivities}
              />
            ))}

            {hasMore && (
              <div className="pt-4 pb-8 flex justify-center">
                <button
                  onClick={handleLoadMore}
                  disabled={isLoading}
                  className="px-4 py-2 text-sm text-brand-text-secondary bg-brand-surface-low hover:bg-brand-surface-hover border border-brand-border rounded-md transition-colors flex items-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    "Load More"
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityTimeline;
