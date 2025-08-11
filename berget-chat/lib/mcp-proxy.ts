// MCP Proxy Service - Routes MCP calls through mcp-remote to n8n server
import { spawn } from 'child_process'
import { MCPToolCall, MCPToolResult } from './mcp-client'

export interface MCPProxyConfig {
  mcpUrl: string
  authToken?: string
}

export class MCPProxy {
  private config: MCPProxyConfig
  private initialized: boolean = false

  constructor(config: MCPProxyConfig) {
    this.config = config
  }

  // Execute a tool call through mcp-remote proxy
  async executeToolCall(toolCall: MCPToolCall): Promise<MCPToolResult> {
    try {
      console.log('MCP Proxy executing tool:', toolCall.name, 'with args:', toolCall.arguments)

      // Create the mcp-remote command
      const args = [
        'mcp-remote',
        this.config.mcpUrl
      ]

      // Add auth header if provided
      if (this.config.authToken) {
        args.push('--header', `Authorization: Bearer ${this.config.authToken}`)
      }

      console.log('Running mcp-remote with args:', args)

      // Execute mcp-remote as a child process
      const result = await this.runMCPRemote(args, toolCall)
      
      return result
    } catch (error) {
      console.error('MCP Proxy execution failed:', error)
      return {
        content: [{
          type: 'text',
          text: `MCP Proxy Error: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      }
    }
  }

  private async runMCPRemote(args: string[], toolCall: MCPToolCall): Promise<MCPToolResult> {
    return new Promise((resolve) => {
      // Spawn the mcp-remote process
      const process = spawn('npx', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      })

      let stdout = ''
      let stderr = ''
      let resolved = false
      
      // Set timeout first
      const timeoutId = setTimeout(() => {
        if (!process.killed && !resolved) {
          console.log('Killing mcp-remote process due to timeout - no response received')
          resolved = true
          process.kill()
          resolve({
            content: [{
              type: 'text',
              text: 'MCP execution timed out - no response received from n8n server'
            }],
            isError: true
          })
        }
      }, 45000) // 45 second timeout

      // Collect output and parse responses in real-time
      process.stdout.on('data', (data) => {
        const chunk = data.toString()
        stdout += chunk
        console.log('mcp-remote stdout chunk:', chunk)
        
        // Check if we have a JSON-RPC response
        if (chunk.includes('"jsonrpc":"2.0"') && !resolved) {
          console.log('Detected JSON-RPC response in stdout')
          try {
            const response = JSON.parse(chunk.trim())
            if (response.result && response.id) {
              console.log('Parsing JSON-RPC response immediately')
              // We got a valid response - resolve immediately
              resolved = true
              clearTimeout(timeoutId)
              process.kill()
              
              if (response.result.content) {
                resolve({
                  content: Array.isArray(response.result.content) ? response.result.content : [response.result.content],
                  isError: false
                })
              } else {
                resolve({
                  content: [{
                    type: 'text',
                    text: typeof response.result === 'string' ? response.result : JSON.stringify(response.result)
                  }],
                  isError: false
                })
              }
              return
            }
          } catch (parseError) {
            console.error('Error parsing JSON-RPC response:', parseError)
          }
        }
      })

      process.stderr.on('data', (data) => {
        const chunk = data.toString()
        stderr += chunk
        console.log('mcp-remote stderr chunk:', chunk)
      })

      // Send the tool call request via stdin
      const request = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: toolCall.name,
          arguments: toolCall.arguments
        },
        id: Date.now()
      }

      try {
        process.stdin.write(JSON.stringify(request) + '\n')
        // Don't close stdin immediately - keep the connection open for response
      } catch (error) {
        console.error('Error writing to mcp-remote stdin:', error)
      }

      // Handle process completion (backup fallback)
      process.on('close', (code) => {
        if (resolved) return
        
        console.log('mcp-remote process closed with code:', code)
        console.log('stdout:', stdout)
        console.log('stderr:', stderr)
        
        clearTimeout(timeoutId)
        resolved = true

        if (code === 0 && stdout) {
          try {
            // Try to parse the full stdout for JSON-RPC response
            const lines = stdout.trim().split('\n')
            for (const line of lines) {
              if (line.includes('"jsonrpc":"2.0"')) {
                const response = JSON.parse(line)
                if (response.result) {
                  if (response.result.content) {
                    resolve({
                      content: Array.isArray(response.result.content) ? response.result.content : [response.result.content],
                      isError: false
                    })
                    return
                  }
                  
                  resolve({
                    content: [{
                      type: 'text',
                      text: typeof response.result === 'string' ? response.result : JSON.stringify(response.result)
                    }],
                    isError: false
                  })
                  return
                }
              }
            }
          } catch (parseError) {
            console.error('Error parsing final stdout:', parseError)
          }
        }

        // Fallback for errors
        resolve({
          content: [{
            type: 'text',
            text: `MCP execution completed with code ${code}. Output: ${stdout || stderr || 'No output'}`
          }],
          isError: code !== 0
        })
      })

      // Handle process errors
      process.on('error', (error) => {
        if (resolved) return
        
        console.error('mcp-remote process error:', error)
        resolved = true
        clearTimeout(timeoutId)
        resolve({
          content: [{
            type: 'text',
            text: `MCP Process Error: ${error.message}`
          }],
          isError: true
        })
      })
    })
  }
}

// Singleton instance
let mcpProxy: MCPProxy | null = null

export function getMCPProxy(): MCPProxy {
  if (!mcpProxy) {
    mcpProxy = new MCPProxy({
      mcpUrl: 'https://nodemation.labbytan.se/mcp/myfirstmcpserver/sse',
      // Add authToken here if your n8n server requires authentication
      // authToken: 'your-auth-token'
    })
  }
  return mcpProxy
}

export async function executeMCPToolViaProxy(toolCall: MCPToolCall): Promise<MCPToolResult> {
  const proxy = getMCPProxy()
  return await proxy.executeToolCall(toolCall)
}