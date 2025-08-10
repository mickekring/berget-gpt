import { NextRequest, NextResponse } from 'next/server'
import { updateUser } from '@/lib/nocodb'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-this'

export async function POST(request: NextRequest) {
  try {
    const { userId, systemPrompt } = await request.json()
    
    // Verify the token from headers
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const token = authHeader.substring(7)
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any
      
      // Ensure the user is updating their own system prompt
      if (decoded.userId !== userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    } catch (error) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }
    
    // Update system prompt in database
    const updatedUser = await updateUser(userId, {
      system_prompt: systemPrompt
    })
    
    if (!updatedUser) {
      return NextResponse.json({ error: 'Failed to update system prompt' }, { status: 500 })
    }
    
    return NextResponse.json({
      success: true,
      user: updatedUser
    })
    
  } catch (error) {
    console.error('Update system prompt error:', error)
    return NextResponse.json(
      { error: 'Failed to update system prompt' },
      { status: 500 }
    )
  }
}