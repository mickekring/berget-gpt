import { NextRequest, NextResponse } from 'next/server'
import { getUserPrompts, createPrompt } from '@/lib/prompts'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-this'

// Get user's prompts
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, JWT_SECRET) as any
    
    const prompts = await getUserPrompts(decoded.userId)
    
    return NextResponse.json({
      success: true,
      prompts
    })
    
  } catch (error) {
    console.error('Get prompts error:', error)
    return NextResponse.json(
      { error: 'Failed to get prompts' },
      { status: 500 }
    )
  }
}

// Create new prompt
export async function POST(request: NextRequest) {
  try {
    const { name, content, isDefault } = await request.json()
    
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, JWT_SECRET) as any
    
    const prompt = await createPrompt({
      userId: decoded.userId,
      name,
      content,
      isDefault
    })
    
    if (!prompt) {
      return NextResponse.json({ error: 'Failed to create prompt' }, { status: 500 })
    }
    
    return NextResponse.json({
      success: true,
      prompt
    })
    
  } catch (error) {
    console.error('Create prompt error:', error)
    return NextResponse.json(
      { error: 'Failed to create prompt' },
      { status: 500 }
    )
  }
}