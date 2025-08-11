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

      // Collect output
      process.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      process.stderr.on('data', (data) => {
        stderr += data.toString()
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
        process.stdin.end()
      } catch (error) {
        console.error('Error writing to mcp-remote stdin:', error)
      }

      // Handle process completion
      process.on('close', (code) => {
        console.log('mcp-remote process closed with code:', code)
        console.log('stdout:', stdout)
        console.log('stderr:', stderr)

        if (code === 0 && stdout) {
          try {
            // Parse the JSON-RPC response
            const lines = stdout.trim().split('\n')
            const lastLine = lines[lines.length - 1]
            const response = JSON.parse(lastLine)

            if (response.error) {
              resolve({
                content: [{
                  type: 'text',
                  text: `MCP Error: ${response.error.message || JSON.stringify(response.error)}`
                }],
                isError: true
              })
              return
            }

            if (response.result) {
              // Handle successful response
              const result = response.result
              
              if (result.content) {
                resolve({
                  content: Array.isArray(result.content) ? result.content : [result.content],
                  isError: false
                })
                return
              }

              // Wrap plain result
              resolve({
                content: [{
                  type: 'text',
                  text: typeof result === 'string' ? result : JSON.stringify(result)
                }],
                isError: false
              })
              return
            }
          } catch (parseError) {
            console.error('Error parsing mcp-remote response:', parseError)
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
        console.error('mcp-remote process error:', error)
        resolve({
          content: [{
            type: 'text',
            text: `MCP Process Error: ${error.message}`
          }],
          isError: true
        })
      })

      // Set timeout
      setTimeout(() => {
        if (!process.killed) {
          console.log('Killing mcp-remote process due to timeout')
          process.kill()
          resolve({
            content: [{
              type: 'text',
              text: 'MCP execution timed out'
            }],
            isError: true
          })
        }
      }, 30000) // 30 second timeout
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