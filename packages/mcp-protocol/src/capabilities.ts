import {
  Capabilities,
  ServerCapabilities,
  ClientCapabilities,
} from "@mcp-log-server/types";

/**
 * Default server capabilities for the MCP Log Server
 */
export const DEFAULT_SERVER_CAPABILITIES: ServerCapabilities = {
  experimental: {},
  logging: {},
  prompts: {
    listChanged: true,
  },
  resources: {
    subscribe: true,
    listChanged: true,
  },
  tools: {
    listChanged: true,
  },
};

/**
 * Capability negotiation utilities
 */
export class CapabilityNegotiator {
  /**
   * Negotiate capabilities between server and client
   * Returns the intersection of capabilities that both support
   */
  static negotiate(
    serverCapabilities: ServerCapabilities,
    clientCapabilities: ClientCapabilities
  ): Capabilities {
    const negotiated: Capabilities = {
      experimental: {},
      logging: {},
      prompts: {},
      resources: {},
      tools: {},
    };

    // Negotiate logging capabilities
    negotiated.logging = this.negotiateLogging(
      serverCapabilities.logging,
      clientCapabilities.logging
    );

    // Negotiate resource capabilities
    negotiated.resources = this.negotiateResources(
      serverCapabilities.resources,
      clientCapabilities.resources
    );

    // Negotiate tool capabilities
    negotiated.tools = this.negotiateTools(
      serverCapabilities.tools,
      clientCapabilities.tools
    );

    // Negotiate prompt capabilities
    negotiated.prompts = this.negotiatePrompts(
      serverCapabilities.prompts,
      clientCapabilities.prompts
    );

    // Negotiate experimental capabilities
    negotiated.experimental = this.negotiateExperimental(
      serverCapabilities.experimental,
      clientCapabilities.experimental
    );

    return negotiated;
  }

  private static negotiateLogging(
    server: ServerCapabilities['logging'],
    client: ClientCapabilities['logging']
  ): Capabilities['logging'] {
    if (!server || !client) {
      return {};
    }

    // Logging capabilities are typically server-driven
    // Client indicates it can receive log messages
    return server;
  }

  private static negotiateResources(
    server: ServerCapabilities['resources'],
    client: ClientCapabilities['resources']
  ): Capabilities['resources'] {
    if (!server || !client) {
      return {};
    }

    return {
      subscribe: Boolean(server.subscribe && client.subscribe),
      listChanged: Boolean(server.listChanged && client.listChanged),
    };
  }

  private static negotiateTools(
    server: ServerCapabilities['tools'],
    client: ClientCapabilities['tools']
  ): Capabilities['tools'] {
    if (!server || !client) {
      return {};
    }

    return {
      listChanged: Boolean(server.listChanged && client.listChanged),
    };
  }

  private static negotiatePrompts(
    server: ServerCapabilities['prompts'],
    client: ClientCapabilities['prompts']
  ): Capabilities['prompts'] {
    if (!server || !client) {
      return {};
    }

    return {
      listChanged: Boolean(server.listChanged && client.listChanged),
    };
  }

  private static negotiateExperimental(
    server: ServerCapabilities['experimental'],
    client: ClientCapabilities['experimental']
  ): Capabilities['experimental'] {
    if (!server || !client) {
      return {};
    }

    // For experimental capabilities, we need to find common ground
    const negotiated: Record<string, unknown> = {};

    // Only include experimental features that both sides support
    for (const [key, serverValue] of Object.entries(server)) {
      if (key in client) {
        const clientValue = client[key];
        // Simple boolean negotiation for experimental features
        if (typeof serverValue === 'boolean' && typeof clientValue === 'boolean') {
          negotiated[key] = serverValue && clientValue;
        } else if (serverValue === clientValue) {
          negotiated[key] = serverValue;
        }
      }
    }

    return negotiated;
  }

  /**
   * Check if a specific capability is supported
   */
  static hasCapability(
    capabilities: Capabilities,
    capability: keyof Capabilities,
    feature?: string
  ): boolean {
    const capabilityGroup = capabilities[capability];
    if (!capabilityGroup || typeof capabilityGroup !== 'object') {
      return false;
    }

    if (!feature) {
      return Object.keys(capabilityGroup).length > 0;
    }

    return Boolean(capabilityGroup[feature as keyof typeof capabilityGroup]);
  }

  /**
   * Validate that capabilities are properly structured
   */
  static validate(capabilities: Partial<Capabilities>): boolean {
    try {
      // Check that all capability groups are objects
      const groups = ['experimental', 'logging', 'prompts', 'resources', 'tools'] as const;
      
      for (const group of groups) {
        const value = capabilities[group];
        if (value !== undefined && (typeof value !== 'object' || value === null)) {
          return false;
        }
      }

      // Validate specific capability structures
      if (capabilities.resources) {
        const { subscribe, listChanged } = capabilities.resources;
        if (subscribe !== undefined && typeof subscribe !== 'boolean') return false;
        if (listChanged !== undefined && typeof listChanged !== 'boolean') return false;
      }

      if (capabilities.tools) {
        const { listChanged } = capabilities.tools;
        if (listChanged !== undefined && typeof listChanged !== 'boolean') return false;
      }

      if (capabilities.prompts) {
        const { listChanged } = capabilities.prompts;
        if (listChanged !== undefined && typeof listChanged !== 'boolean') return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a capabilities diff showing what's supported/unsupported
   */
  static diff(
    requested: Capabilities,
    negotiated: Capabilities
  ): {
    supported: Capabilities;
    unsupported: Capabilities;
  } {
    const supported: Capabilities = {
      experimental: {},
      logging: {},
      prompts: {},
      resources: {},
      tools: {},
    };

    const unsupported: Capabilities = {
      experimental: {},
      logging: {},
      prompts: {},
      resources: {},
      tools: {},
    };

    // Compare each capability group
    const groups: (keyof Capabilities)[] = ['experimental', 'logging', 'prompts', 'resources', 'tools'];
    
    for (const group of groups) {
      const requestedGroup = requested[group] || {};
      const negotiatedGroup = negotiated[group] || {};

      // Handle experimental separately since it has different typing
      if (group === 'experimental') {
        for (const [key, value] of Object.entries(requestedGroup as Record<string, unknown>)) {
          const negotiatedValue = (negotiatedGroup as Record<string, unknown>)[key];
          if (negotiatedValue === value) {
            (supported[group] as Record<string, unknown>)[key] = value;
          } else {
            (unsupported[group] as Record<string, unknown>)[key] = value;
          }
        }
      } else {
        // Handle other capability groups with known structure
        for (const [key, value] of Object.entries(requestedGroup)) {
          const negotiatedValue = (negotiatedGroup as any)[key];
          if (negotiatedValue === value) {
            (supported[group] as any)[key] = value;
          } else {
            (unsupported[group] as any)[key] = value;
          }
        }
      }
    }

    return { supported, unsupported };
  }

  /**
   * Merge multiple capability sets (useful for combining default + custom capabilities)
   */
  static merge(...capabilitySets: Partial<Capabilities>[]): Capabilities {
    const merged: Capabilities = {
      experimental: {},
      logging: {},
      prompts: {},
      resources: {},
      tools: {},
    };

    for (const capabilities of capabilitySets) {
      if (capabilities.experimental && merged.experimental) {
        Object.assign(merged.experimental, capabilities.experimental);
      }
      if (capabilities.logging && merged.logging) {
        Object.assign(merged.logging, capabilities.logging);
      }
      if (capabilities.prompts && merged.prompts) {
        Object.assign(merged.prompts, capabilities.prompts);
      }
      if (capabilities.resources && merged.resources) {
        Object.assign(merged.resources, capabilities.resources);
      }
      if (capabilities.tools && merged.tools) {
        Object.assign(merged.tools, capabilities.tools);
      }
    }

    return merged;
  }
} 