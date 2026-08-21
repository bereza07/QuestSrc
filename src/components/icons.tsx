// Minimal inline stroke icons — keeps the app offline and dependency-free.
interface IconProps {
  className?: string;
  size?: number;
}

function base(size = 18, className = "") {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
  };
}

export const IconDashboard = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
  </svg>
);

export const IconTasks = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <path d="M4 6l1 1 1.5-2M4 12l1 1 1.5-2M4 18l1 1 1.5-2" />
  </svg>
);

export const IconCalendar = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M3 9h18M8 2v4M16 2v4" />
  </svg>
);

export const IconGoals = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" />
  </svg>
);

export const IconCharacter = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
  </svg>
);

export const IconStats = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
  </svg>
);

export const IconChat = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />
  </svg>
);

export const IconSettings = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
  </svg>
);

export const IconCheck = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

export const IconPlus = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconFlame = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M12 2c1 3 4 4.5 4 8a4 4 0 1 1-8 0c0-1.5.6-2.6 1.2-3.4C9.8 7.5 11 6 12 2z" />
    <path d="M12 22a6 6 0 0 0 6-6c0-2-1-3.5-2-4.5.2 3-1.8 4.5-4 4.5" />
  </svg>
);

export const IconTrash = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

export const IconPlay = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M6 4l14 8-14 8V4z" />
  </svg>
);

export const IconPause = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M8 4v16M16 4v16" />
  </svg>
);

export const IconStop = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <rect x="5" y="5" width="14" height="14" rx="2" />
  </svg>
);

export const IconClock = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
