'use client';

import DashboardBuilder from '@/components/charts/DashboardBuilder';
import { useCallback, useEffect, useState } from 'react';

export default function DashboardBuilderPage() {
  const [initialDashboard, setInitialDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const handleSave = useCallback((dashboard: any) => {
    // Save to localStorage with a consistent key
    console.log('Saving dashboard:', dashboard);
    localStorage.setItem('current-dashboard', JSON.stringify(dashboard));
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

  // Load the last saved dashboard on component mount
  useEffect(() => {
    const loadInitialDashboard = () => {
      try {
        const saved = localStorage.getItem('current-dashboard');
        if (saved) {
          const dashboard = JSON.parse(saved);
          setInitialDashboard(dashboard);
        }
      } catch (error) {
        console.error('Error loading dashboard:', error);
      } finally {
        setLoading(false);
      }
    };

    loadInitialDashboard();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-300">Loading dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <DashboardBuilder 
          onSave={handleSave}
          onLoad={handleLoad}
          initialDashboard={initialDashboard}
        />
      </div>
    </div>
  );
}
