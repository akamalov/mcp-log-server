'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

const navigationItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/logs', label: 'Log Viewer' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/analytics/enhanced', label: 'Enhanced Analytics' },
  { href: '/agents', label: 'Agent Manager' },
  { href: '/forwarders', label: 'Forwarders' },
  { href: '/dashboard-builder', label: 'Dashboard Builder' }
];

export default function Navigation() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  return (
    <nav className="sticky top-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b border-gray-200 dark:border-gray-800 shadow-sm">
      <div className="max-w-5xl mx-auto w-full px-4 py-3 flex items-center gap-6">
        <Link 
          href="/" 
          className="text-lg font-bold text-blue-700 dark:text-blue-400 tracking-tight hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          MCP Log Server
        </Link>
        
        {navigationItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`relative font-medium transition-colors ${
              isActive(item.href)
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400'
            }`}
          >
            {item.label}
            {isActive(item.href) && (
              <span className="absolute -bottom-3 left-0 w-full h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full"></span>
            )}
          </Link>
        ))}
      </div>
    </nav>
  );
} 