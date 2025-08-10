import { NextRequest, NextResponse } from 'next/server'
import { createMessage } from '@/lib/chat-history'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-this'

// Create new message
export async function POST(request: NextRequest) {
  try {
    const { conversationId, role, content, modelUsed, promptUsed, metadata } = await request.json()
    
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const token = authHeader.substring(7)
    jwt.verify(token, JWT_SECRET) as any
    
    const message = await createMessage({
      conversationId,
      role,
      content,
      modelUsed,
      promptUsed,
      metadata
    })
    
    if (!message) {
      return NextResponse.json({ error: 'Failed to create message' }, { status: 500 })
    }
    
    return NextResponse.json({
      success: true,
      message
    })
    
  } catch (error) {
    console.error('Create message error:', error)
    return NextResponse.json(
      { error: 'Failed to create message' },
      { status: 500 }
    )
  }
}