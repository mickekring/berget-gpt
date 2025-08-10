import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { updateUser } from '@/lib/nocodb'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    
    // Verify token
    let decoded: any
    try {
      decoded = jwt.verify(token, JWT_SECRET)
    } catch (error) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { userId, language } = await request.json()

    if (!userId || !language) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Validate language
    const validLanguages = ['sv', 'en', 'uk']
    if (!validLanguages.includes(language)) {
      return NextResponse.json({ error: 'Invalid language' }, { status: 400 })
    }

    // Ensure the user is updating their own profile
    if (String(decoded.userId) !== String(userId)) {
      return NextResponse.json({ error: 'Unauthorized - User ID mismatch' }, { status: 401 })
    }

    // Update user language using the existing nocodb helper
    const updatedUser = await updateUser(userId, { language })

    if (!updatedUser) {
      return NextResponse.json({ error: 'Failed to update language' }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Language updated successfully' 
    })
  } catch (error) {
    console.error('Language update error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}