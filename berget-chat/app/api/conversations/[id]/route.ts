import { NextRequest, NextResponse } from 'next/server'
import { updateConversation, deleteConversation, getConversationMessages } from '@/lib/chat-history'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-this'

// Get conversation messages
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = await params
    const conversationId = parseInt(id)
    
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const token = authHeader.substring(7)
    jwt.verify(token, JWT_SECRET) as any
    
    const messages = await getConversationMessages(conversationId)
    
    return NextResponse.json({
      success: true,
      messages
    })
    
  } catch (error) {
    console.error('Get conversation messages error:', error)
    return NextResponse.json(
      { error: 'Failed to get messages' },
      { status: 500 }
    )
  }
}

// Update conversation
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { title, isArchived } = await request.json()
    const { id } = await params
    const conversationId = parseInt(id)
    
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const token = authHeader.substring(7)
    jwt.verify(token, JWT_SECRET) as any
    
    const conversation = await updateConversation(conversationId, {
      title,
      is_archived: isArchived
    })
    
    if (!conversation) {
      return NextResponse.json({ error: 'Failed to update conversation' }, { status: 500 })
    }
    
    return NextResponse.json({
      success: true,
      conversation
    })
    
  } catch (error) {
    console.error('Update conversation error:', error)
    return NextResponse.json(
      { error: 'Failed to update conversation' },
      { status: 500 }
    )
  }
}

// Delete conversation
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = await params
    const conversationId = parseInt(id)
    
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const token = authHeader.substring(7)
    jwt.verify(token, JWT_SECRET) as any
    
    const success = await deleteConversation(conversationId)
    
    if (!success) {
      return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 })
    }
    
    return NextResponse.json({
      success: true
    })
    
  } catch (error) {
    console.error('Delete conversation error:', error)
    return NextResponse.json(
      { error: 'Failed to delete conversation' },
      { status: 500 }
    )
  }
}