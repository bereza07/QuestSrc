import type { ReactNode, SVGProps } from "react";

// Icon system for the redesigned UI.
//
// Single-weight strokes at 1.5px, 16px default box, `currentColor` so utility
// classes like `text-fg-2` colour them. All icons share the same viewBox and
// stroke rules for a coherent visual voice.
//
// The old palette used a handful of aliases (IconDashboard, IconGoals, etc.);
// we re-export the closest equivalents at the bottom so page-level imports
// don't need to change.

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  size?: number;
  strokeWidth?: number;
}

function Svg({
  size = 16,
  strokeWidth = 1.5,
  className,
  children,
  ...rest
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconGrid      = (p: IconProps) => (<Svg {...p}><rect x="1.5" y="1.5" width="5" height="5" rx="1"/><rect x="9.5" y="1.5" width="5" height="5" rx="1"/><rect x="1.5" y="9.5" width="5" height="5" rx="1"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/></Svg>);
export const IconTasks     = (p: IconProps) => (<Svg {...p}><rect x="2" y="2" width="12" height="12" rx="1.5"/><polyline points="5,8.5 7,10.5 11,6.5"/></Svg>);
export const IconCalendar  = (p: IconProps) => (<Svg {...p}><rect x="1.5" y="3" width="13" height="11.5" rx="1.5"/><line x1="1.5" y1="7" x2="14.5" y2="7"/><line x1="5" y1="1.5" x2="5" y2="4.5"/><line x1="11" y1="1.5" x2="11" y2="4.5"/></Svg>);
export const IconTarget    = (p: IconProps) => (<Svg {...p}><circle cx="8" cy="8" r="6.5"/><circle cx="8" cy="8" r="3.5"/><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none"/></Svg>);
export const IconUser      = (p: IconProps) => (<Svg {...p}><circle cx="8" cy="5.5" r="3"/><path d="M2 14.5c0-3.3 2.7-6 6-6s6 2.7 6 6"/></Svg>);
export const IconBarChart  = (p: IconProps) => (<Svg {...p}><line x1="1" y1="15" x2="15" y2="15"/><rect x="2" y="9" width="3" height="6" rx="0.5"/><rect x="6.5" y="5" width="3" height="10" rx="0.5"/><rect x="11" y="2" width="3" height="13" rx="0.5"/></Svg>);
export const IconMessage   = (p: IconProps) => (<Svg {...p}><path d="M13.5 1.5H2.5A1 1 0 001.5 2.5v8a1 1 0 001 1h3l2.5 3 2.5-3h3a1 1 0 001-1v-8a1 1 0 00-1-1z"/></Svg>);
// A proper gear (cog) — 8 teeth around a hollow center. Distinct from IconSun
// so it can't be misread as "light mode" in the sidebar footer.
export const IconSettings  = (p: IconProps) => (<Svg {...p} viewBox="0 0 24 24"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/></Svg>);
export const IconChevronLeft  = (p: IconProps) => (<Svg {...p}><polyline points="10,3 5,8 10,13"/></Svg>);
export const IconChevronRight = (p: IconProps) => (<Svg {...p}><polyline points="6,3 11,8 6,13"/></Svg>);
export const IconChevronDown  = (p: IconProps) => (<Svg {...p}><polyline points="3,6 8,11 13,6"/></Svg>);
export const IconChevronUp    = (p: IconProps) => (<Svg {...p}><polyline points="3,10 8,5 13,10"/></Svg>);
export const IconPlus      = (p: IconProps) => (<Svg {...p}><line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/></Svg>);
export const IconSearch    = (p: IconProps) => (<Svg {...p}><circle cx="7" cy="7" r="5"/><line x1="10.5" y1="10.5" x2="14" y2="14"/></Svg>);
export const IconX         = (p: IconProps) => (<Svg {...p}><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></Svg>);
export const IconCheck     = (p: IconProps) => (<Svg {...p}><polyline points="2,8 6,12 14,4"/></Svg>);
export const IconClock     = (p: IconProps) => (<Svg {...p}><circle cx="8" cy="8" r="6.5"/><polyline points="8,4 8,8 11,10"/></Svg>);
export const IconZap       = (p: IconProps) => (<Svg {...p}><polygon points="9.5,2 4.5,9 8.5,9 6.5,14 11.5,7 7.5,7 9.5,2"/></Svg>);
export const IconFlame     = (p: IconProps) => (<Svg {...p}><path d="M8 14c-3 0-5.5-2.5-5.5-5.5 0-2 1-3.5 2-4.5 0 .8.5 2 1.5 2.5C6 4.5 7 2.5 8 1.5c0 1.5 1 2.5 2 3.5.5-.8.5-1.8.5-2.5C11.5 3.5 13.5 5.5 13.5 8.5 13.5 11.5 11 14 8 14z"/></Svg>);
export const IconTrophy    = (p: IconProps) => (<Svg {...p}><path d="M5 1.5h6v5c0 2.8-1.3 5-3 5s-3-2.2-3-5v-5z"/><path d="M5 5H2.5A1.5 1.5 0 001 6.5 1.5 1.5 0 002.5 8H5"/><path d="M11 5h2.5A1.5 1.5 0 0115 6.5 1.5 1.5 0 0113.5 8H11"/><line x1="8" y1="11.5" x2="8" y2="14"/><line x1="5" y1="14" x2="11" y2="14"/></Svg>);
export const IconStar      = (p: IconProps) => (<Svg {...p}><polygon points="8,1.5 9.7,5.8 14.3,6.2 11,9.1 12,13.5 8,11.2 4,13.5 5,9.1 1.7,6.2 6.3,5.8"/></Svg>);
export const IconPlay      = (p: IconProps) => (<Svg {...p}><polygon points="4,2 13,8 4,14"/></Svg>);
export const IconPause     = (p: IconProps) => (<Svg {...p}><line x1="5" y1="2.5" x2="5" y2="13.5"/><line x1="11" y1="2.5" x2="11" y2="13.5"/></Svg>);
export const IconStop      = (p: IconProps) => (<Svg {...p}><rect x="2.5" y="2.5" width="11" height="11" rx="1"/></Svg>);
export const IconRotateCCW = (p: IconProps) => (<Svg {...p}><path d="M4 4A6 6 0 1 0 8 2"/><polyline points="4,1.5 4,4.5 7,4.5"/></Svg>);
export const IconSend      = (p: IconProps) => (<Svg {...p}><line x1="14.5" y1="1.5" x2="7" y2="9"/><polygon points="14.5,1.5 9.5,14.5 7,9 1.5,6.5 14.5,1.5"/></Svg>);
export const IconTrash     = (p: IconProps) => (<Svg {...p}><polyline points="2,4 14,4"/><path d="M6 4V3a.5.5 0 01.5-.5h3A.5.5 0 0110 3v1"/><path d="M13 4l-1 9.5A1 1 0 0111 14.5H5A1 1 0 014 13.5L3 4"/><line x1="6.5" y1="7" x2="6.5" y2="11.5"/><line x1="9.5" y1="7" x2="9.5" y2="11.5"/></Svg>);
export const IconEdit      = (p: IconProps) => (<Svg {...p}><path d="M10 2.5l3.5 3.5L5 14.5l-3.5.5.5-3.5L10 2.5z"/><line x1="8.5" y1="4" x2="12" y2="7.5"/></Svg>);
// Clean crescent — clearly reads as "moon / dark mode" even at 14px.
export const IconMoon      = (p: IconProps) => (<Svg {...p} viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></Svg>);
export const IconSun       = (p: IconProps) => (<Svg {...p} viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.9" y1="4.9" x2="6.3" y2="6.3"/><line x1="17.7" y1="17.7" x2="19.1" y2="19.1"/><line x1="4.9" y1="19.1" x2="6.3" y2="17.7"/><line x1="17.7" y1="6.3" x2="19.1" y2="4.9"/></Svg>);
export const IconFolder    = (p: IconProps) => (<Svg {...p}><path d="M1.5 4.5A1.5 1.5 0 013 3h3.5l1.5 2H13A1.5 1.5 0 0114.5 6.5v6A1.5 1.5 0 0113 14H3A1.5 1.5 0 011.5 12.5V4.5z"/></Svg>);
export const IconFlag      = (p: IconProps) => (<Svg {...p}><line x1="3.5" y1="1.5" x2="3.5" y2="14.5"/><path d="M3.5 2.5h8.5l-2 3.5 2 3.5H3.5"/></Svg>);
export const IconMore      = (p: IconProps) => (<Svg {...p}><circle cx="4" cy="8" r="1.2" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="8" r="1.2" fill="currentColor" stroke="none"/></Svg>);
export const IconArrowRight= (p: IconProps) => (<Svg {...p}><line x1="2" y1="8" x2="14" y2="8"/><polyline points="9,3 14,8 9,13"/></Svg>);
export const IconTimer     = (p: IconProps) => (<Svg {...p}><circle cx="8" cy="9" r="6"/><line x1="8" y1="2.5" x2="8" y2="4"/><line x1="5.5" y1="2" x2="10.5" y2="2"/><polyline points="8,6 8,9 10,10.5"/></Svg>);
export const IconFilter    = (p: IconProps) => (<Svg {...p}><polyline points="1.5,2 14.5,2 9,8.5 9,14 7,14 7,8.5 1.5,2"/></Svg>);
export const IconBook      = (p: IconProps) => (<Svg {...p}><path d="M8 13.5A5 5 0 013 8.5V1.5h10v7A5 5 0 018 13.5z"/><line x1="8" y1="1.5" x2="8" y2="14"/></Svg>);
export const IconMenu      = (p: IconProps) => (<Svg {...p}><line x1="2" y1="4" x2="14" y2="4"/><line x1="2" y1="8" x2="14" y2="8"/><line x1="2" y1="12" x2="14" y2="12"/></Svg>);

// Aliases for the old naming so existing imports still work.
export const IconDashboard = IconGrid;
export const IconGoals     = IconTarget;
export const IconCharacter = IconUser;
export const IconStats     = IconBarChart;
export const IconChat      = IconMessage;
