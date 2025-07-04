import AgentManager from '../../components/AgentManager';

export default function AgentsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <AgentManager />
    </div>
  );
}

export const metadata = {
  title: 'Agent Manager - MCP Log Server',
  description: 'Manage custom agents and log sources for the MCP Log Server',
}; 