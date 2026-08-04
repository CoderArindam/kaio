import React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?:
    | "primary"
    | "secondary"
    | "success"
    | "warning"
    | "danger"
    | "info"
    | "outline";
  size?: "sm" | "md";
}

export const Badge: React.FC<BadgeProps> = ({
  className = "",
  variant = "secondary",
  size = "md",
  children,
  ...props
}) => {
  const baseStyles = "inline-flex items-center font-medium rounded-full";

  const variantStyles = {
    primary:
      "bg-brand-primary/10 dark:bg-brand-primary/20 text-brand-primary border border-brand-primary/30 font-semibold",
    secondary:
      "bg-brand-surface-container text-brand-text-muted border border-brand-border font-medium",
    success:
      "bg-[#dcfce7] text-[#14532d] border border-[#86efac] dark:bg-emerald-950/50 dark:text-[#6ee7b7] dark:border-emerald-700/40 font-semibold",
    warning:
      "bg-[#fef3c7] text-[#78350f] border border-[#fcd34d] dark:bg-amber-950/50 dark:text-[#fde68a] dark:border-amber-700/40 font-semibold",
    danger:
      "bg-[#fee2e2] text-[#7f1d1d] border border-[#fca5a5] dark:bg-red-950/50 dark:text-[#fca5a5] dark:border-red-700/40 font-semibold",
    info:
      "bg-[#e0f2fe] text-[#0c4a6e] border border-[#7dd3fc] dark:bg-sky-950/50 dark:text-[#7dd3fc] dark:border-sky-700/40 font-semibold",
    outline: "border border-brand-border text-brand-text font-medium",
  };

  const sizeStyles = {
    sm: "px-2 py-0.5 text-[10px]",
    md: "px-2.5 py-0.5 text-xs",
  };

  return (
    <span
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};

export default Badge;
