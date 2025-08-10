import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { functions, executeFunction } from '@/lib/functions'

const openai = new OpenAI({
  apiKey: process.env.BERGET_API_KEY,
  baseURL: 'https://api.berget.ai/v1'
})

export async function POST(request: NextRequest) {
  try {
    const { messages, model, documentChunks } = await request.json()
    console.log('Chat API received', documentChunks?.length || 0, 'document chunks')

    // Only enable function calling for Llama model (which supports it)
    const supportsTools = model.includes('Llama')

    if (supportsTools) {
      try {
        // First, try to get a response with function calling
        const initialResponse = await openai.chat.completions.create({
          model: model,
          messages: messages,
          temperature: 0.7,
          max_tokens: 2000,
          stream: false,
          tools: functions.map(func => ({
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
          
          console.log('Executing function:', functionName, 'with', documentChunks?.length || 0, 'document chunks')
      const functionResult = await executeFunction(functionName, functionArgs, documentChunks)

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