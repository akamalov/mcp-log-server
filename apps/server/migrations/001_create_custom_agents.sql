-- Migration: Create custom agents table
-- Description: Set up table for storing custom agent configurations

CREATE TABLE IF NOT EXISTS custom_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    config JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    auto_discovery BOOLEAN DEFAULT false,
    log_paths TEXT[] NOT NULL,
    format_type VARCHAR(100) DEFAULT 'text',
    filters JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_sync_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_custom_agents_user_id ON custom_agents(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_agents_type ON custom_agents(type);
CREATE INDEX IF NOT EXISTS idx_custom_agents_is_active ON custom_agents(is_active);
CREATE INDEX IF NOT EXISTS idx_custom_agents_created_at ON custom_agents(created_at);
CREATE INDEX IF NOT EXISTS idx_custom_agents_updated_at ON custom_agents(updated_at);

-- Create GIN index for JSONB fields
CREATE INDEX IF NOT EXISTS idx_custom_agents_config ON custom_agents USING gin(config);
CREATE INDEX IF NOT EXISTS idx_custom_agents_filters ON custom_agents USING gin(filters);
CREATE INDEX IF NOT EXISTS idx_custom_agents_metadata ON custom_agents USING gin(metadata);

-- Create trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_custom_agents_updated_at 
    BEFORE UPDATE ON custom_agents 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add unique constraint to prevent duplicate names per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_agents_user_name_unique 
    ON custom_agents(COALESCE(user_id, ''), name);

-- Add constraint to ensure at least one log path
ALTER TABLE custom_agents 
    ADD CONSTRAINT chk_custom_agents_log_paths_not_empty 
    CHECK (array_length(log_paths, 1) > 0);

-- Add constraint to ensure valid format types
ALTER TABLE custom_agents 
    ADD CONSTRAINT chk_custom_agents_format_type 
    CHECK (format_type IN ('text', 'json', 'structured', 'vscode-extension', 'claude-mcp-json'));

-- Add comments for documentation
COMMENT ON TABLE custom_agents IS 'Custom agent configurations for log monitoring';
COMMENT ON COLUMN custom_agents.id IS 'Unique identifier for the custom agent';
COMMENT ON COLUMN custom_agents.user_id IS 'User who created the agent (optional)';
COMMENT ON COLUMN custom_agents.name IS 'Display name for the agent';
COMMENT ON COLUMN custom_agents.type IS 'Agent type (e.g., custom, claude-custom, etc.)';
COMMENT ON COLUMN custom_agents.config IS 'Additional configuration as JSON';
COMMENT ON COLUMN custom_agents.is_active IS 'Whether the agent is currently active';
COMMENT ON COLUMN custom_agents.auto_discovery IS 'Whether this agent was auto-discovered';
COMMENT ON COLUMN custom_agents.log_paths IS 'Array of log file/directory paths to monitor';
COMMENT ON COLUMN custom_agents.format_type IS 'Log format type for parsing';
COMMENT ON COLUMN custom_agents.filters IS 'Log level filters as JSON array';
COMMENT ON COLUMN custom_agents.metadata IS 'Additional metadata as JSON';
COMMENT ON COLUMN custom_agents.created_at IS 'Timestamp when agent was created';
COMMENT ON COLUMN custom_agents.updated_at IS 'Timestamp when agent was last updated';
COMMENT ON COLUMN custom_agents.last_sync_at IS 'Timestamp when logs were last synchronized';

-- Insert a sample custom agent for testing
INSERT INTO custom_agents (
    name, 
    type, 
    log_paths, 
    format_type, 
    filters, 
    metadata
) VALUES (
    'Sample Custom Agent',
    'custom-text',
    ARRAY['/tmp/sample.log'],
    'text',
    '["info", "warn", "error"]',
    '{"description": "Sample custom agent for testing", "version": "1.0.0"}'
) ON CONFLICT DO NOTHING; 