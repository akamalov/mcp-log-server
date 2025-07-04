'use client';

import DashboardBuilder from '@/components/charts/DashboardBuilder';
import { useCallback } from 'react';

export default function DashboardBuilderPage() {
  const handleSave = useCallback((dashboard: any) => {
    // In production, this would save to a backend API
    console.log('Saving dashboard:', dashboard);
    localStorage.setItem(`dashboard-${dashboard.id}`, JSON.stringify(dashboard));
    alert('Dashboard saved successfully!');
  }, []);

  const handleLoad = useCallback(async (dashboardId: string) => {
    // In production, this would load from a backend API
    const saved = localStorage.getItem(`dashboard-${dashboardId}`);
    if (saved) {
      return JSON.parse(saved);
    }
    throw new Error('Dashboard not found');
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardBuilder 
        onSave={handleSave}
        onLoad={handleLoad}
      />
    </div>
  );
}
