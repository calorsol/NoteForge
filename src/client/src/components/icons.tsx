type IconProps = { size?: number; className?: string };

function base(size: number, className: string | undefined, children: React.ReactNode) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const SearchIcon = ({ size = 16, className }: IconProps) =>
  base(size, className, (
    <>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </>
  ));

export const ChevronDown = ({ size = 16, className }: IconProps) =>
  base(size, className, <polyline points="6 9 12 15 18 9" />);

export const ChevronUp = ({ size = 16, className }: IconProps) =>
  base(size, className, <polyline points="6 15 12 9 18 15" />);

export const ChevronsRight = ({ size = 16, className }: IconProps) =>
  base(size, className, (
    <>
      <polyline points="7 7 12 12 7 17" />
      <polyline points="13 7 18 12 13 17" />
    </>
  ));

export const ChevronsLeft = ({ size = 16, className }: IconProps) =>
  base(size, className, (
    <>
      <polyline points="11 7 6 12 11 17" />
      <polyline points="17 7 12 12 17 17" />
    </>
  ));

export const EyeIcon = ({ size = 16, className }: IconProps) =>
  base(size, className, (
    <>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ));

export const PlusIcon = ({ size = 16, className }: IconProps) =>
  base(size, className, (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ));

export const TrashIcon = ({ size = 16, className }: IconProps) =>
  base(size, className, (
    <>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </>
  ));

export const CalendarIcon = ({ size = 16, className }: IconProps) =>
  base(size, className, (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </>
  ));
