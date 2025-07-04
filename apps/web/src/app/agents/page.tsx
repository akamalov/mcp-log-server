'use client';

import dynamic from 'next/dynamic';

// Dynamically import AgentManager to avoid SSR issues
const AgentManager = dynamic(() => import('../../components/AgentManager'), {
  ssr: false,
  loading: () => (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
        <div className="h-64 bg-gray-200 rounded"></div>
      </div>
    </div>
  )
});

export default function AgentsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <AgentManager />
    </div>
  );
} 