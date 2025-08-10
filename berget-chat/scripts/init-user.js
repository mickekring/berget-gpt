// Script to create initial user in NocoDB
// Run with: node scripts/init-user.js

const axios = require('axios')
const bcrypt = require('bcryptjs')

const NOCODB_API_URL = 'https://nocodb.labbytan.se'
const NOCODB_API_TOKEN = 'Dy5Z5EjFaT8_-DRPMa4UIPsPM_CPd3xKSSUucFqR'
const NOCODB_BASE_NAME = 'BergetGPT'

async function createInitialUser() {
  try {
    // Hash the password
    const password_hash = await bcrypt.hash('kring', 10)
    
    const userData = {
      username: 'micke',
      password_hash,
      email: 'micke@example.com',
      first_name: 'Micke',
      last_name: 'Kring',
      system_prompt: '',
      theme: 'light',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    
    const response = await axios.post(
      `${NOCODB_API_URL}/api/v1/db/data/v1/${NOCODB_BASE_NAME}/users`,
      userData,
      {
        headers: {
          'xc-token': NOCODB_API_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    )
    
    console.log('✅ User created successfully:', response.data)
  } catch (error) {
    if (error.response) {
      console.error('Error:', error.response.data)
    } else {
      console.error('Error creating user:', error.message)
    }
  }
}

createInitialUser()