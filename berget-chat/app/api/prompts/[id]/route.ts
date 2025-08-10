import { NextRequest, NextResponse } from 'next/server'
import { updatePrompt, deletePrompt, setDefaultPrompt } from '@/lib/prompts'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-this'

// Update prompt
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { name, content, isDefault } = await request.json()
    const { id } = await params
    const promptId = parseInt(id)
    
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, JWT_SECRET) as any
    
    // If setting as default, use the setDefaultPrompt function
    if (isDefault) {
      await setDefaultPrompt(decoded.userId, promptId)
    }
    
    const prompt = await updatePrompt(promptId, {
      name,
      content,
      is_default: isDefault
    })
    
    if (!prompt) {
      return NextResponse.json({ error: 'Failed to update prompt' }, { status: 500 })
    }
    
    return NextResponse.json({
      success: true,
      prompt
    })
    
  } catch (error) {
    console.error('Update prompt error:', error)
    return NextResponse.json(
      { error: 'Failed to update prompt' },
      { status: 500 }
    )
  }
}

// Delete prompt
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = await params
    const promptId = parseInt(id)
    
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const token = authHeader.substring(7)
    jwt.verify(token, JWT_SECRET) as any
    
    const success = await deletePrompt(promptId)
    
    if (!success) {
      return NextResponse.json({ error: 'Failed to delete prompt' }, { status: 500 })
    }
    
    return NextResponse.json({
      success: true
    })
    
  } catch (error) {
    console.error('Delete prompt error:', error)
    return NextResponse.json(
      { error: 'Failed to delete prompt' },
      { status: 500 }
    )
  }
}