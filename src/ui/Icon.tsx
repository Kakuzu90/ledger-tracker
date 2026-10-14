import type { SVGProps } from 'react'

// Stroke icons lifted from the mockups' inline SVG (24x24, 1.8 stroke).
// Global `svg` base styles in index.css supply fill/stroke defaults.

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 22, children, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...props}>
      {children}
    </svg>
  )
}

export const HomeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
  </Svg>
)

export const ActivityIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
  </Svg>
)

export const LoansIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 7h13l-3-3M17 17H4l3 3" />
  </Svg>
)

export const ReportsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 20v-9M12 20V4M19 20v-6M3 20h18" />
  </Svg>
)

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const ChevronLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 6l-6 6 6 6" />
  </Svg>
)

export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
)

export const SettingsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Svg>
)

export const EyeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
)

export const CalendarIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Svg>
)

export const DownloadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </Svg>
)

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </Svg>
)

export const EditIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
  </Svg>
)

export const AlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 9v4M12 17h.01M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
  </Svg>
)

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
)

export const RefreshIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 11a8 8 0 1 0-2.3 6.3M20 5v6h-6" />
  </Svg>
)

export const RepeatIcon = (p: IconProps) => (
  <Svg size={16} {...p}>
    <path d="M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4" />
  </Svg>
)

export const ReceiptIcon = (p: IconProps) => (
  <Svg size={16} {...p}>
    <rect x="3" y="6" width="18" height="14" rx="2" />
    <circle cx="12" cy="13" r="3.5" />
    <path d="M9 6l1.5-2h3L15 6" />
  </Svg>
)

export const CopyIcon = (p: IconProps) => (
  <Svg size={20} {...p}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
  </Svg>
)

export const SplitIcon = (p: IconProps) => (
  <Svg size={20} {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6" />
  </Svg>
)

export const TrashIcon = (p: IconProps) => (
  <Svg size={18} {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Svg>
)

export const BankIcon = (p: IconProps) => (
  <Svg size={20} {...p}>
    <path d="M3 10h18M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18M12 3l9 5H3z" />
  </Svg>
)

export const PhoneIcon = (p: IconProps) => (
  <Svg size={20} {...p}>
    <rect x="6" y="2" width="12" height="20" rx="2.5" />
    <path d="M11 18h2" />
  </Svg>
)

export const CashIcon = (p: IconProps) => (
  <Svg size={20} {...p}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
  </Svg>
)

export const CardIcon = (p: IconProps) => (
  <Svg size={20} {...p}>
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M3 10h18M7 15h4" />
  </Svg>
)

export const ArchiveIcon = (p: IconProps) => (
  <Svg size={20} {...p}>
    <rect x="3" y="4" width="18" height="5" rx="1.5" />
    <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" />
  </Svg>
)

export const ShareIcon = (p: IconProps) => (
  <Svg size={18} {...p}>
    <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v12M8 7l4-4 4 4" />
  </Svg>
)

export const CheckIcon = (p: IconProps) => (
  <Svg size={18} {...p}>
    <path d="M5 12l5 5 9-10" />
  </Svg>
)

export const PersonIcon = (p: IconProps) => (
  <Svg size={20} {...p}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </Svg>
)

export const BellIcon = (p: IconProps) => (
  <Svg size={20} {...p}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 21h4" />
  </Svg>
)

export const ChevronDownIcon = (p: IconProps) => (
  <Svg size={18} {...p}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
)
