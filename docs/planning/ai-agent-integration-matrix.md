# AI Agent Integration Matrix for MCP Log Server

## Supported AI Agents

### Claude Code (Anthropic)
- **Log Location**: 
  - macOS: `~/Library/Application Support/Claude/logs/`
  - Windows: `%APPDATA%\Claude\logs\`
  - Linux: `~/.config/claude/logs/`
- **Log Format**: JSON Lines
- **MCP Compliance**: Native MCP support
- **Integration Method**: Direct file monitoring + API hooks
- **Authentication**: API key required for real-time streaming

```typescript
interface ClaudeLogEntry {
  timestamp: string;
  level: string;
  message: string;
  request_id: string;
  model: string;
  tokens_used: number;
  conversation_id: string;
}
```

### Cursor AI
- **Log Location**:
  - macOS: `~/Library/Logs/Cursor/`
  - Windows: `%APPDATA%\Cursor\logs\`
  - Linux: `~/.config/Cursor/logs/`
- **Log Format**: Mixed (JSON + plain text)
- **MCP Compliance**: Partial (requires adapter)
- **Integration Method**: File monitoring with format conversion
- **Special Considerations**: Real-time cursor position tracking

### VS Code Copilot
- **Log Location**:
  - macOS: `~/Library/Application Support/Code/logs/`
  - Windows: `%APPDATA%\Code\logs\`
  - Linux: `~/.config/Code/logs/`
- **Log Format**: VS Code native format
- **MCP Compliance**: None (requires full conversion)
- **Integration Method**: Extension API + file monitoring
- **Authentication**: GitHub authentication required

### Gemini CLI
- **Log Location**: 
  - macOS/Linux: `~/.config/gemini/logs/`
  - Windows: `%USERPROFILE%\.config\gemini\logs\`
- **Log Format**: Structured JSON
- **MCP Compliance**: Configurable output format
- **Integration Method**: CLI integration + file monitoring
- **Special Features**: Command history correlation

### Custom MCP Sources
- **Configuration**: User-defined via JSON schema
- **Validation**: Runtime schema validation
- **Hot Reload**: Configuration changes without restart
- **Plugin System**: Custom parsers and processors

```json
{
  "custom_sources": {
    "my_ai_agent": {
      "type": "file",
      "paths": {
        "linux": "~/.local/share/my-ai/logs/*.log",
        "darwin": "~/Library/Logs/MyAI/*.log", 
        "win32": "%LOCALAPPDATA%\\MyAI\\logs\\*.log"
      },
      "format": "json",
      "mcp_adapter": "custom_json_parser",
      "polling_interval": 1000,
      "privacy_level": "medium"
    }
  }
}
```

## Cross-Agent Correlation

### Session Correlation
- **Correlation Keys**: user_id, workspace_path, timestamp proximity
- **Algorithm**: Fuzzy matching with confidence scoring
- **Storage**: Separate correlation table with relationship mapping

### Request Tracing
- **Distributed Tracing**: OpenTelemetry integration
- **Trace ID Propagation**: Across AI agent boundaries
- **Causal Relationships**: Parent-child request mapping

## Performance Optimization

### Agent-Specific Optimizations
- **Claude**: Batch API calls to reduce latency
- **Cursor**: File watching with debouncing for high-frequency updates
- **VS Code**: Extension API for direct integration
- **Gemini**: CLI output buffering and parsing

### Scaling Considerations
- **Per-Agent Rate Limiting**: Configurable per source
- **Memory Management**: Streaming processing for large logs
- **Storage Optimization**: Agent-specific compression strategies 