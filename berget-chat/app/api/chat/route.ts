import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { functions, executeFunction } from '@/lib/functions'
import { getMCPTools, executeMCPTool, initializeMCPClient } from '@/lib/mcp-client'

const openai = new OpenAI({
  apiKey: process.env.BERGET_API_KEY,
  baseURL: 'https://api.berget.ai/v1'
})

export async function POST(request: NextRequest) {
  try {
    const { messages, model, documentChunks, mcpEnabled = true } = await request.json()
    console.log('Chat API received', documentChunks?.length || 0, 'document chunks')
    console.log('MCP enabled:', mcpEnabled)

    // Only enable function calling for Llama model (which supports it) and if MCP is enabled
    const supportsTools = model.includes('Llama') && mcpEnabled

    if (supportsTools) {
      try {
        // Get available tools (built-in functions + MCP tools)
        const allTools = [...functions]
        
        // Add MCP tools if available
        try {
          let mcpTools = getMCPTools()
          
          // If no MCP tools cached, try to initialize
          if (mcpTools.length === 0) {
            console.log('Initializing MCP client for chat...')
            mcpTools = await initializeMCPClient()
          }
          
          // Convert MCP tools to OpenAI function format
          const mcpFunctions = mcpTools.map(tool => ({
            name: `mcp_${tool.name}`,
            description: `[MCP Tool] ${tool.description}`,
            parameters: tool.inputSchema
          }))
          
          allTools.push(...mcpFunctions)
          console.log('Using', functions.length, 'built-in tools and', mcpFunctions.length, 'MCP tools')
        } catch (mcpError) {
          console.warn('Failed to load MCP tools:', mcpError)
        }

        // First, try to get a response with function calling
        const initialResponse = await openai.chat.completions.create({
          model: model,
          messages: messages,
          temperature: 0.7,
          max_tokens: 2000,
          stream: false,
          tools: allTools.map(func => ({
            type: "function",
            function: func
          })),
          tool_choice: "auto"
        })

        const initialMessage = initialResponse.choices[0].message

        // Check if the AI wants to call a function
        if (initialMessage.tool_calls && initialMessage.tool_calls.length > 0) {
          const toolCall = initialMessage.tool_calls[0]
          // Execute the function
          const functionName = toolCall.function.name
          const functionArgs = JSON.parse(toolCall.function.arguments || '{}')
          
          let functionResult: string
          
          // Check if this is an MCP tool
          if (functionName.startsWith('mcp_')) {
            const mcpToolName = functionName.substring(4) // Remove 'mcp_' prefix
            console.log('Executing MCP tool:', mcpToolName, 'with args:', functionArgs)
            
            try {
              const mcpResult = await executeMCPTool({
                name: mcpToolName,
                arguments: functionArgs
              })
              
              // Format MCP result for the AI
              if (mcpResult.isError) {
                functionResult = `Error executing MCP tool: ${mcpResult.content.map(c => c.text).join('\n')}`
              } else {
                functionResult = mcpResult.content.map(content => {
                  if (content.type === 'text') {
                    return content.text || ''
                  } else if (content.type === 'image') {
                    return `[Image: ${content.mimeType || 'unknown'}]`
                  } else if (content.type === 'resource') {
                    return `[Resource: ${content.mimeType || 'unknown'}]`
                  }
                  return '[Unknown content type]'
                }).join('\n')
              }
            } catch (mcpError) {
              console.error('MCP tool execution failed:', mcpError)
              functionResult = `Failed to execute MCP tool: ${mcpError}`
            }
          } else {
            // Execute built-in function
            console.log('Executing built-in function:', functionName, 'with', documentChunks?.length || 0, 'document chunks')
            functionResult = await executeFunction(functionName, functionArgs, documentChunks)
          }

          // Add function result to conversation
          const messagesWithFunction = [
            ...messages,
            initialMessage,
            {
              role: 'tool',
              tool_call_id: toolCall.id,
              content: functionResult
            }
          ]

          // Get final response with function result
          const finalStream = await openai.chat.completions.create({
            model: model,
            messages: messagesWithFunction,
            temperature: 0.7,
            max_tokens: 2000,
            stream: true
          })

          const encoder = new TextEncoder()
          const readableStream = new ReadableStream({
            async start(controller) {
              try {
                // Send function call info first
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                  content: '', 
                  function_call: { name: functionName, arguments: functionArgs }
                })}\n\n`))

                // Then stream the final response
                for await (const chunk of finalStream) {
                  const content = chunk.choices[0]?.delta?.content || ''
                  if (content) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`))
                  }
                }
                controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              } catch (error) {
                controller.error(error)
              } finally {
                controller.close()
              }
            }
          })

          return new Response(readableStream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive'
            }
          })
        }
      } catch (toolError) {
        console.log('Function calling not supported or failed, falling back to normal streaming')
      }
    }

    // No function call needed or function calling not supported, stream normal response
    const stream = await openai.chat.completions.create({
      model: model,
      messages: messages,
      temperature: 0.7,
      max_tokens: 2000,
      stream: true
    })

    const encoder = new TextEncoder()
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || ''
            if (content) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`))
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        } catch (error) {
          controller.error(error)
        } finally {
          controller.close()
        }
      }
    })

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })
  } catch (error) {
    console.error('API route error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}