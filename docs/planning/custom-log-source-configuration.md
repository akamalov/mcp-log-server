# Custom MCP Log Source Configuration Guide

## Overview

The MCP Log Server supports custom log sources through a flexible configuration system that allows users to add any AI agent or logging system that produces structured logs. This guide provides comprehensive instructions for configuring custom sources.

## Configuration Schema

### Basic Configuration Structure
```json
{
  "custom_sources": {
    "source_id": {
      "name": "Human readable name",
      "type": "file|api|webhook|database",
      "enabled": true,
      "priority": 1,
      "config": {
        // Type-specific configuration
      },
      "processing": {
        "format": "json|csv|plain|custom",
        "parser": "parser_name",
        "filters": [],
        "transformations": []
      },
      "privacy": {
        "level": "high|medium|low",
        "custom_rules": []
      },
      "retention": {
        "days": 90,
        "archival_strategy": "compress|delete|external"
      }
    }
  }
}
```

## File-Based Log Sources

### Configuration
```json
{
  "custom_sources": {
    "my_ai_agent": {
      "name": "My Custom AI Agent",
      "type": "file",
      "enabled": true,
      "config": {
        "paths": {
          "linux": [
            "~/.local/share/my-ai/logs/*.log",
            "/var/log/my-ai/*.log"
          ],
          "darwin": [
            "~/Library/Logs/MyAI/*.log",
            "~/Library/Application Support/MyAI/logs/*.log"
          ],
          "win32": [
            "%LOCALAPPDATA%\\MyAI\\logs\\*.log",
            "%APPDATA%\\MyAI\\logs\\*.log"
          ]
        },
        "watch_mode": "polling|inotify|fsevents",
        "polling_interval": 1000,
        "encoding": "utf8",
        "follow_symlinks": false,
        "recursive": true,
        "ignore_patterns": [
          "*.tmp",
          "*.backup",
          "*~"
        ]
      },
      "processing": {
        "format": "json",
        "multiline": {
          "enabled": true,
          "pattern": "^\\d{4}-\\d{2}-\\d{2}",
          "negate": false
        },
        "field_mapping": {
          "timestamp": "$.timestamp",
          "level": "$.severity",
          "message": "$.msg",
          "context": "$.metadata"
        }
      }
    }
  }
}
```

### Advanced File Monitoring
```json
{
  "advanced_file_config": {
    "rotation_handling": {
      "detect_rotation": true,
      "rotation_patterns": [
        "*.log.1",
        "*.log.YYYY-MM-DD",
        "*.log.gz"
      ],
      "handle_gaps": true
    },
    "performance": {
      "buffer_size": 8192,
      "batch_size": 100,
      "flush_interval": 5000,
      "max_concurrent_files": 50
    },
    "error_handling": {
      "skip_malformed": true,
      "retry_count": 3,
      "retry_delay": 1000,
      "dead_letter_queue": true
    }
  }
}
```

## API-Based Log Sources

### REST API Configuration
```json
{
  "custom_sources": {
    "external_ai_api": {
      "name": "External AI Service API",
      "type": "api",
      "enabled": true,
      "config": {
        "endpoint": "https://api.example.com/logs",
        "method": "GET",
        "headers": {
          "Authorization": "Bearer ${API_TOKEN}",
          "Content-Type": "application/json"
        },
        "query_params": {
          "since": "${LAST_TIMESTAMP}",
          "limit": 1000
        },
        "polling_interval": 30000,
        "timeout": 10000,
        "rate_limit": {
          "requests_per_minute": 60,
          "burst_size": 10
        },
        "authentication": {
          "type": "bearer|oauth2|api_key",
          "config": {
            "token_endpoint": "https://auth.example.com/token",
            "client_id": "${CLIENT_ID}",
            "client_secret": "${CLIENT_SECRET}",
            "scope": "logs:read"
          }
        }
      },
      "processing": {
        "response_path": "$.data.logs",
        "pagination": {
          "type": "cursor|offset",
          "next_cursor_path": "$.pagination.next_cursor",
          "has_more_path": "$.pagination.has_more"
        }
      }
    }
  }
}
```

### WebSocket Configuration
```json
{
  "custom_sources": {
    "realtime_ai_logs": {
      "name": "Real-time AI Log Stream",
      "type": "websocket",
      "enabled": true,
      "config": {
        "url": "wss://logs.example.com/stream",
        "headers": {
          "Authorization": "Bearer ${WS_TOKEN}"
        },
        "reconnect": {
          "enabled": true,
          "max_attempts": 5,
          "delay": 5000,
          "backoff_factor": 2
        },
        "heartbeat": {
          "enabled": true,
          "interval": 30000,
          "message": "{\"type\": \"ping\"}"
        }
      }
    }
  }
}
```

## Database Log Sources

### SQL Database Configuration
```json
{
  "custom_sources": {
    "database_logs": {
      "name": "Database Stored Logs",
      "type": "database",
      "enabled": true,
      "config": {
        "connection": {
          "type": "postgresql|mysql|sqlite|mongodb",
          "host": "localhost",
          "port": 5432,
          "database": "ai_logs",
          "username": "${DB_USER}",
          "password": "${DB_PASSWORD}",
          "ssl": true,
          "pool": {
            "min": 2,
            "max": 10,
            "idle_timeout": 30000
          }
        },
        "query": {
          "sql": "SELECT * FROM ai_logs WHERE created_at > $1 ORDER BY created_at ASC",
          "parameters": ["${LAST_TIMESTAMP}"],
          "polling_interval": 60000,
          "batch_size": 1000
        },
        "timestamp_column": "created_at",
        "incremental_column": "id"
      }
    }
  }
}
```

## Custom Parsers and Processors

### Custom Parser Definition
```javascript
// custom_parsers/my_ai_parser.js
class MyAIParser {
  constructor(config) {
    this.config = config;
  }
  
  canParse(rawData) {
    // Logic to determine if this parser can handle the data
    return rawData.includes('[MyAI]');
  }
  
  parse(rawData) {
    // Custom parsing logic
    const lines = rawData.split('\n');
    const entries = [];
    
    for (const line of lines) {
      if (line.trim()) {
        const match = line.match(/^\[MyAI\] (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z) \[(\w+)\] (.+)$/);
        if (match) {
          entries.push({
            timestamp: match[1],
            level: match[2].toLowerCase(),
            message: match[3],
            source: 'my_ai',
            raw: line
          });
        }
      }
    }
    
    return entries;
  }
  
  validate(entry) {
    // Validation logic
    return entry.timestamp && entry.level && entry.message;
  }
}

module.exports = MyAIParser;
```

### Custom Processor Configuration
```json
{
  "custom_processors": {
    "my_ai_enricher": {
      "type": "enricher",
      "config": {
        "fields": {
          "user_id": {
            "source": "context.user",
            "transform": "hash_sha256"
          },
          "session_duration": {
            "source": "context.session_start",
            "transform": "calculate_duration"
          }
        }
      }
    },
    "sensitive_data_filter": {
      "type": "filter",
      "config": {
        "patterns": [
          {
            "field": "message",
            "regex": "password\\s*[:=]\\s*\\S+",
            "replacement": "password: [REDACTED]"
          },
          {
            "field": "context",
            "path": "$.api_key",
            "action": "remove"
          }
        ]
      }
    }
  }
}
```

## Environment Variable Management

### Configuration with Environment Variables
```json
{
  "environment": {
    "variables": {
      "API_TOKEN": {
        "required": true,
        "description": "API token for external service"
      },
      "DB_PASSWORD": {
        "required": true,
        "description": "Database password",
        "encrypted": true
      },
      "LOG_LEVEL": {
        "required": false,
        "default": "info",
        "description": "Default log level"
      }
    },
    "vault_integration": {
      "enabled": true,
      "provider": "hashicorp_vault|aws_secrets|azure_keyvault",
      "config": {
        "endpoint": "https://vault.example.com",
        "auth_method": "token",
        "mount_path": "secret/mcp-log-server"
      }
    }
  }
}
```

## Validation and Testing

### Configuration Validation
```javascript
// Configuration validation schema
const configSchema = {
  type: 'object',
  properties: {
    custom_sources: {
      type: 'object',
      patternProperties: {
        '^[a-zA-Z][a-zA-Z0-9_-]*$': {
          type: 'object',
          required: ['name', 'type', 'config'],
          properties: {
            name: { type: 'string', minLength: 1 },
            type: { enum: ['file', 'api', 'webhook', 'database'] },
            enabled: { type: 'boolean', default: true },
            config: {
              type: 'object',
              // Type-specific validation
            }
          }
        }
      }
    }
  }
};
```

### Testing Configuration
```bash
# Test configuration validity
mcp-log-server test-config --config ./config/custom-sources.json

# Test specific source
mcp-log-server test-source --source my_ai_agent --dry-run

# Validate custom parser
mcp-log-server test-parser --parser ./parsers/my_ai_parser.js --sample ./samples/my_ai.log
```

## Hot Configuration Reloading

### Configuration Management
```json
{
  "configuration": {
    "hot_reload": {
      "enabled": true,
      "watch_files": [
        "./config/custom-sources.json",
        "./config/processors.json"
      ],
      "reload_strategy": "graceful|immediate",
      "validation": {
        "strict": true,
        "backup_on_error": true
      }
    },
    "change_detection": {
      "method": "file_watch|polling",
      "interval": 5000,
      "debounce": 1000
    }
  }
}
```

## Best Practices

### Performance Optimization
- Use appropriate polling intervals based on log volume
- Implement proper error handling and retries
- Configure resource limits to prevent memory issues
- Use connection pooling for database sources

### Security Considerations
- Store sensitive credentials in environment variables or secret managers
- Use encryption for data in transit and at rest
- Implement proper access controls and authentication
- Regular security audits of custom parsers and processors

### Monitoring and Alerting
- Monitor custom source health and performance
- Set up alerts for source failures or data quality issues
- Track processing metrics and error rates
- Implement proper logging for troubleshooting

## Migration and Upgrades

### Version Compatibility
- Maintain backward compatibility for configuration schemas
- Provide migration tools for configuration updates
- Document breaking changes and migration paths
- Support gradual rollout of new configurations

This comprehensive configuration system ensures that the MCP Log Server can adapt to virtually any AI agent or logging system while maintaining security, performance, and reliability standards. 