export interface ToolInputSchema {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
}

export interface ToolModule {
    name: string;
    description: string;
    inputSchema: ToolInputSchema;
    handle: (args: Record<string, unknown>) => Promise<unknown>;
}
