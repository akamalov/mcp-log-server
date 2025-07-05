'use client';

import dynamic from 'next/dynamic';

// Dynamically import AgentManager to avoid SSR issues
const AgentManager = dynamic(() => import('../../components/AgentManager'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-300">Loading agent manager...</p>
        </div>
      </div>
    </div>
  )
});

export default function AgentsPage() {
  return <AgentManager />;
} 